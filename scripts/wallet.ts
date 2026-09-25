/**
 * Shared Preprod wallet setup for the CLI scripts: seed handling, key
 * derivation, WASM proving, the sync cache and DUST helpers.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import type { DustAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
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
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

// The wallet SDK's GraphQL subscriptions expect a global WebSocket implementation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = WebSocket;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const WALLET_CACHE_DIR = path.join(ROOT, '.wallet-cache');

// ─── Network configuration (Preprod) ──────────────────────────────────────────
export const CONFIG = {
  networkId: 'preprod',
  indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  nodeUrl: 'https://rpc.preprod.midnight.network',
  // Optional: prove through a local proof server instead of in-process WASM.
  proofServerUrl: process.env.PROOF_SERVER_URL,
  faucetUrl: 'https://faucet.preprod.midnight.network',
  zkConfigDir: path.join(ROOT, 'managed', 'burs_eligibility'),
} as const;

export type CircuitId = 'check_eligibility';

// ─── Seed and keys ────────────────────────────────────────────────────────────

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

// ─── State helpers ────────────────────────────────────────────────────────────

export const waitFor = (wallet: WalletFacade, predicate: (s: FacadeState) => boolean) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced && predicate(s))));

export const nightBalance = (s: FacadeState) => s.unshielded.balances[ledger.nativeToken().raw] ?? 0n;
export const dustBalance = (s: FacadeState) => s.dust.balance(new Date());

/** Submits a DUST (de)registration recipe and returns the transaction id. */
const submitRecipe = async (wallet: WalletFacade, recipe: Parameters<WalletFacade['finalizeRecipe']>[0]) =>
  wallet.submitTransaction(await wallet.finalizeRecipe(recipe));

/**
 * Registers every unregistered tNIGHT UTXO for DUST generation. DUST goes to
 * this wallet unless `receiver` names another wallet's DUST address.
 */
export const registerForDust = async (ctx: PreprodWallet, receiver?: DustAddress) => {
  const state = await waitFor(ctx.wallet, () => true);
  const unregistered = state.unshielded.availableCoins.filter((c) => !c.meta.registeredForDustGeneration);
  if (unregistered.length === 0) return undefined;
  const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
    unregistered,
    ctx.keystore.getPublicKey(),
    (payload) => ctx.keystore.signData(payload),
    receiver,
  );
  return submitRecipe(ctx.wallet, recipe);
};

/** Stops every registered tNIGHT UTXO from generating DUST. */
export const deregisterFromDust = async (ctx: PreprodWallet) => {
  const state = await waitFor(ctx.wallet, () => true);
  const registered = state.unshielded.availableCoins.filter((c) => c.meta.registeredForDustGeneration);
  if (registered.length === 0) return undefined;
  const recipe = await ctx.wallet.deregisterFromDustGeneration(
    [...registered],
    ctx.keystore.getPublicKey(),
    (payload) => ctx.keystore.signData(payload),
  );
  return submitRecipe(ctx.wallet, recipe);
};

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type PreprodWallet = {
  wallet: WalletFacade;
  seed: string;
  keystore: UnshieldedKeystore;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  zkConfigProvider: NodeZkConfigProvider<CircuitId>;
  keyMaterialProvider: KeyMaterialProvider;
  synced: FacadeState;
  saveCache: () => Promise<void>;
  close: () => Promise<void>;
};

/** Opens the script wallet from .env, restores the sync cache and waits until synced. */
export const openPreprodWallet = async (): Promise<PreprodWallet> => {
  setNetworkId(CONFIG.networkId);
  const networkId = getNetworkId();

  const seed = loadOrCreateSeed();
  const keys = deriveKeys(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const keystore = createKeystore(keys[Roles.NightExternal], networkId);

  const zkConfigProvider = new NodeZkConfigProvider<CircuitId>(CONFIG.zkConfigDir);
  const keyMaterialProvider = makeKeyMaterialProvider(zkConfigProvider);
  console.log(
    CONFIG.proofServerUrl
      ? `🧮 Proof'lar proof server ile üretilecek: ${CONFIG.proofServerUrl}`
      : "🧮 Proof'lar yerelde WASM ile üretilecek (ilk seferde anahtarlar indirilir)",
  );

  const cached = loadWalletCache(seed);
  if (cached) console.log('💾 Önbellekteki cüzdan durumu yükleniyor, senkronizasyon kaldığı yerden devam edecek.');

  const wallet = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: { indexerHttpUrl: CONFIG.indexerHttpUrl, indexerWsUrl: CONFIG.indexerWsUrl },
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
        : UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (config) =>
      cached
        ? DustWallet(config).restore(cached.dust)
        : DustWallet(config).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log(`👛 Cüzdan adresi (unshielded): ${keystore.getBech32Address().asString()}`);
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
  const saveCache = () => saveWalletCache(wallet, seed);
  // Save progress every minute so an interrupted first sync is not lost.
  const cacheTimer = setInterval(() => void saveCache().catch(() => {}), 60_000);
  const synced = await waitFor(wallet, () => true);
  progressLog.unsubscribe();
  clearInterval(cacheTimer);
  await saveCache();
  console.log(`✅ Senkronize. tNIGHT: ${nightBalance(synced)}, DUST: ${dustBalance(synced)}\n`);

  return {
    wallet,
    seed,
    keystore,
    shieldedSecretKeys,
    dustSecretKey,
    zkConfigProvider,
    keyMaterialProvider,
    synced,
    saveCache,
    close: async () => {
      await saveCache();
      await wallet.stop();
    },
  };
};
