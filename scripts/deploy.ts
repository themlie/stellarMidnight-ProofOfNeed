/**
 * ProofOfNeed (BursEligibility contract) — Preprod deploy script
 *
 * Kullanım: npm run deploy
 *
 * ZK proof'lar varsayılan olarak Node içinde WASM ile üretilir; Docker gerekmez.
 * Yerel bir proof server kullanmak için PROOF_SERVER_URL ortam değişkenini verin.
 *
 * İlk çalıştırmada .env içinde MIDNIGHT_SEED yoksa yeni bir cüzdan seed'i üretilir
 * ve .env'e yazılır. Script cüzdanın unshielded adresini yazdırır; bu adrese
 * https://faucet.preprod.midnight.network adresinden tNIGHT gönderin. Script
 * tNIGHT'ı görünce DUST üretimine kaydeder, DUST oluşunca sözleşmeyi deploy eder.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  createProofProvider,
  type MidnightProvider,
  type ProofProvider,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { makeWasmProvingService } from '@midnight-ntwrk/wallet-sdk-capabilities/proving';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import {
  WalletEntrySchema,
  WalletFacade,
  mergeWalletEntries,
  type FacadeState,
} from '@midnight-ntwrk/wallet-sdk-facade';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { WasmProver } from '@midnight-ntwrk/wallet-sdk-prover-client/effect';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  PublicKey,
  UnshieldedWallet,
  createKeystore,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import type { KeyMaterialProvider } from '@midnight-ntwrk/zkir-v2';
import { Effect } from 'effect';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

import { Contract } from '../managed/burs_eligibility/contract/index.js';
import { createBursPrivateState, witnesses, type BursPrivateState } from '../src/witnesses.js';

// The wallet SDK's GraphQL subscriptions expect a global WebSocket implementation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const WALLET_CACHE_DIR = path.join(ROOT, '.wallet-cache');

// ─── Network configuration (Preprod) ──────────────────────────────────────────
const CONFIG = {
  networkId: 'preprod',
  indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  nodeUrl: 'https://rpc.preprod.midnight.network',
  // Optional: prove through a local proof server instead of in-process WASM.
  proofServerUrl: process.env.PROOF_SERVER_URL,
  faucetUrl: 'https://faucet.preprod.midnight.network',
  zkConfigDir: path.join(ROOT, 'managed', 'burs_eligibility'),
} as const;

// Income threshold chosen by the foundation (10000 TL).
const INITIAL_THRESHOLD = 10000n;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadOrCreateSeed = (): string => {
  if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
  const existing = process.env.MIDNIGHT_SEED;
  if (existing) return existing;

  const seed = Buffer.from(generateRandomSeed()).toString('hex');
  fs.appendFileSync(ENV_PATH, `MIDNIGHT_SEED=${seed}\n`);
  console.log('🔑 Yeni cüzdan seed\'i üretildi ve .env dosyasına yazıldı.');
  console.log('   Bu seed cüzdanınızın anahtarıdır: yedekleyin, asla commit etmeyin.\n');
  return seed;
};

const deriveKeys = (seedHex: string) => {
  const result = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (result.type !== 'seedOk') throw new Error(`Geçersiz seed: ${String(result.type)}`);

  const derived = result.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Anahtar türetme başarısız');
  result.hdWallet.clear();

  return derived.keys;
};

// ─── Wallet sync cache ────────────────────────────────────────────────────────
// A first sync replays the whole Preprod history and takes a long time, so the
// synced wallet state is saved locally and restored on the next run.

type WalletCache = { shielded: string; unshielded: string; dust: string };

const walletCachePath = (seed: string) =>
  path.join(WALLET_CACHE_DIR, `${createHash('sha256').update(seed).digest('hex').slice(0, 16)}.json`);

const loadWalletCache = (seed: string): WalletCache | undefined => {
  try {
    return JSON.parse(fs.readFileSync(walletCachePath(seed), 'utf8')) as WalletCache;
  } catch {
    return undefined;
  }
};

const saveWalletCache = async (wallet: WalletFacade, seed: string) => {
  const state = await Rx.firstValueFrom(wallet.state());
  const cache: WalletCache = {
    shielded: state.shielded.serialize(),
    unshielded: state.unshielded.serialize(),
    dust: state.dust.serialize(),
  };
  fs.mkdirSync(WALLET_CACHE_DIR, { recursive: true });
  fs.writeFileSync(walletCachePath(seed), JSON.stringify(cache));
};

type CircuitId = 'check_eligibility';

/**
 * Supplies proving keys to the in-process WASM prover: this contract's circuit
 * keys come from managed/, the built-in zswap/dust keys and SRS parameters are
 * downloaded by the wallet SDK's default provider.
 */
const makeKeyMaterialProvider = (zkConfigProvider: NodeZkConfigProvider<CircuitId>): KeyMaterialProvider => {
  const builtIn = WasmProver.makeDefaultKeyMaterialProvider();
  return {
    lookupKey: async (keyLocation) => {
      if (keyLocation !== 'check_eligibility') return builtIn.lookupKey(keyLocation);
      const { proverKey, verifierKey, zkir } = await zkConfigProvider.get(keyLocation);
      return { proverKey, verifierKey, ir: zkir };
    },
    getParams: (k) => builtIn.getParams(k),
  };
};

const waitFor = (wallet: WalletFacade, predicate: (s: FacadeState) => boolean) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced && predicate(s))));

const nightBalance = (s: FacadeState) => s.unshielded.balances[ledger.nativeToken().raw] ?? 0n;
const dustBalance = (s: FacadeState) => s.dust.balance(new Date());

/** Makes sure the wallet holds tNIGHT and that it is generating DUST for fees. */
const ensureDust = async (wallet: WalletFacade, keystore: UnshieldedKeystore) => {
  let state = await waitFor(wallet, () => true);

  if (dustBalance(state) > 0n) return;

  if (nightBalance(state) === 0n) {
    console.log('💧 Cüzdanda tNIGHT yok. Faucet\'ten tNIGHT isteyin:');
    console.log(`   ${CONFIG.faucetUrl}`);
    console.log(`   Adres: ${keystore.getBech32Address().asString()}\n`);
    console.log('⏳ tNIGHT gelmesi bekleniyor (script açık kalabilir)...');
    state = await waitFor(wallet, (s) => nightBalance(s) > 0n);
    console.log(`✅ tNIGHT geldi: ${nightBalance(state)}\n`);
  }

  const unregistered = state.unshielded.availableCoins.filter((c) => !c.meta.registeredForDustGeneration);
  if (unregistered.length > 0) {
    console.log(`⏳ ${unregistered.length} tNIGHT UTXO'su DUST üretimine kaydediliyor...`);
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      keystore.getPublicKey(),
      (payload) => keystore.signData(payload),
    );
    const txId = await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
    console.log(`✅ Kayıt işlemi gönderildi: ${txId}\n`);
  }

  console.log('⏳ DUST birikmesi bekleniyor (birkaç dakika sürebilir)...');
  state = await waitFor(wallet, (s) => dustBalance(s) > 0n);
  console.log(`✅ DUST bakiyesi: ${dustBalance(state)}\n`);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌑 ProofOfNeed — Preprod deploy\n');

  setNetworkId(CONFIG.networkId);
  const networkId = getNetworkId();

  // ─── Wallet ────────────────────────────────────────────────────────────────
  const seed = loadOrCreateSeed();
  const keys = deriveKeys(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const zkConfigProvider = new NodeZkConfigProvider<CircuitId>(CONFIG.zkConfigDir);
  const keyMaterialProvider = makeKeyMaterialProvider(zkConfigProvider);
  console.log(
    CONFIG.proofServerUrl
      ? `🧮 Proof'lar proof server ile üretilecek: ${CONFIG.proofServerUrl}`
      : "🧮 Proof'lar yerelde WASM ile üretilecek (ilk seferde anahtarlar indirilir)",
  );

  const indexerClientConnection = {
    indexerHttpUrl: CONFIG.indexerHttpUrl,
    indexerWsUrl: CONFIG.indexerWsUrl,
  };

  const cached = loadWalletCache(seed);
  if (cached) console.log('💾 Önbellekteki cüzdan durumu yükleniyor, senkronizasyon kaldığı yerden devam edecek.');

  const wallet = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection,
      ...(CONFIG.proofServerUrl ? { provingServerUrl: new URL(CONFIG.proofServerUrl) } : {}),
      relayURL: new URL(CONFIG.nodeUrl.replace(/^http/, 'ws')),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    ...(CONFIG.proofServerUrl ? {} : { provingService: () => makeWasmProvingService({ keyMaterialProvider }) }),
    shielded: (config) =>
      cached
        ? ShieldedWallet(config).restore(cached.shielded)
        : ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      cached
        ? UnshieldedWallet(config).restore(cached.unshielded)
        : UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) =>
      cached
        ? DustWallet(config).restore(cached.dust)
        : DustWallet(config).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log(`👛 Cüzdan adresi (unshielded): ${unshieldedKeystore.getBech32Address().asString()}`);
  console.log('⏳ Cüzdan senkronize ediliyor (ilk seferde birkaç dakika sürebilir)...');
  const progressLog = wallet
    .state()
    .pipe(Rx.throttleTime(15_000))
    .subscribe((s) => {
      const p = (x: unknown) => {
        const { appliedIndex, highestIndex } = x as { appliedIndex?: bigint; highestIndex?: bigint };
        return `${appliedIndex ?? '?'}/${highestIndex ?? '?'}`;
      };
      const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(
        `   shielded ${p(s.shielded.progress)} · unshielded ${p(s.unshielded.progress)} · dust ${p(s.dust.progress)} · heap ${heapMb} MB`,
      );
    });
  // Save progress every minute so an interrupted first sync is not lost.
  const cacheTimer = setInterval(() => void saveWalletCache(wallet, seed).catch(() => {}), 60_000);
  const synced = await waitFor(wallet, () => true);
  progressLog.unsubscribe();
  clearInterval(cacheTimer);
  await saveWalletCache(wallet, seed);
  console.log(`✅ Senkronize. tNIGHT: ${nightBalance(synced)}, DUST: ${dustBalance(synced)}\n`);

  await ensureDust(wallet, unshieldedKeystore);

  // ─── Providers ─────────────────────────────────────────────────────────────
  const walletProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => synced.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => synced.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signed = await wallet.signRecipe(recipe, (payload) => unshieldedKeystore.signData(payload));
      return wallet.finalizeRecipe(signed);
    },
    submitTx: (tx) => wallet.submitTransaction(tx),
  };

  const proofProvider: ProofProvider = CONFIG.proofServerUrl
    ? httpClientProofProvider(CONFIG.proofServerUrl, zkConfigProvider)
    : createProofProvider(Effect.runSync(WasmProver.create({ keyMaterialProvider })).asProvingProvider());
  const providers = {
    privateStateProvider: levelPrivateStateProvider<'burs-eligibility', BursPrivateState>({
      privateStateStoreName: 'burs-eligibility-state',
      accountId: unshieldedKeystore.getBech32Address().asString(),
      // The provider requires 3+ character classes; a bare hex digest only has two.
      privateStoragePasswordProvider: () => `Burs-${createHash('sha256').update(`burs:${seed}`).digest('hex')}`,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexerHttpUrl, CONFIG.indexerWsUrl),
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider: walletProvider,
  };

  // ─── Deploy ────────────────────────────────────────────────────────────────
  const compiledContract = CompiledContract.make('burs_eligibility', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(CONFIG.zkConfigDir),
  );

  console.log(`⏳ Sözleşme deploy ediliyor (threshold = ${INITIAL_THRESHOLD} TL)...`);
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'burs-eligibility',
    // The deployer never proves eligibility, so its local income is irrelevant.
    initialPrivateState: createBursPrivateState(0n),
    args: [INITIAL_THRESHOLD],
  });

  const { contractAddress, txId, blockHeight } = deployed.deployTxData.public;

  console.log('\n🎉 DEPLOY BAŞARILI');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📍 Contract address : ${contractAddress}`);
  console.log(`🧾 Transaction ID   : ${txId}`);
  console.log(`📦 Block height     : ${blockHeight}`);
  console.log(`🌐 Network          : ${CONFIG.networkId}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const deploymentInfo = {
    network: CONFIG.networkId,
    contractAddress,
    txId,
    blockHeight,
    initialThreshold: INITIAL_THRESHOLD.toString(),
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ROOT, 'deployment-preprod.json'), JSON.stringify(deploymentInfo, null, 2) + '\n');
  console.log('💾 deployment-preprod.json dosyasına kaydedildi.');

  await saveWalletCache(wallet, seed);
  await wallet.stop();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Deploy hatası:', err);
  process.exit(1);
});
