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

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import {
  createProofProvider,
  type MidnightProvider,
  type ProofProvider,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { WasmProver } from '@midnight-ntwrk/wallet-sdk-prover-client/effect';
import { Effect } from 'effect';

import { Contract } from '../managed/burs_eligibility/contract/index.js';
import { createBursPrivateState, witnesses, type BursPrivateState } from '../src/witnesses.js';
import {
  CONFIG,
  ROOT,
  dustBalance,
  nightBalance,
  openPreprodWallet,
  registerForDust,
  waitFor,
  type PreprodWallet,
} from './wallet.js';

// Income threshold chosen by the foundation (10000 TL).
const INITIAL_THRESHOLD = 10000n;

/** Makes sure the wallet holds tNIGHT and that it is generating DUST for fees. */
const ensureDust = async (ctx: PreprodWallet) => {
  let state = await waitFor(ctx.wallet, () => true);
  if (dustBalance(state) > 0n) return;

  if (nightBalance(state) === 0n) {
    console.log('💧 Cüzdanda tNIGHT yok. Faucet\'ten tNIGHT isteyin:');
    console.log(`   ${CONFIG.faucetUrl}`);
    console.log(`   Adres: ${ctx.keystore.getBech32Address().asString()}\n`);
    console.log('⏳ tNIGHT gelmesi bekleniyor (script açık kalabilir)...');
    state = await waitFor(ctx.wallet, (s) => nightBalance(s) > 0n);
    console.log(`✅ tNIGHT geldi: ${nightBalance(state)}\n`);
  }

  console.log("⏳ tNIGHT UTXO'ları DUST üretimine kaydediliyor...");
  const txId = await registerForDust(ctx);
  if (txId) console.log(`✅ Kayıt işlemi gönderildi: ${txId}\n`);

  console.log('⏳ DUST birikmesi bekleniyor (birkaç dakika sürebilir)...');
  state = await waitFor(ctx.wallet, (s) => dustBalance(s) > 0n);
  console.log(`✅ DUST bakiyesi: ${dustBalance(state)}\n`);
};

async function main() {
  console.log('🌑 ProofOfNeed — Preprod deploy\n');

  const ctx = await openPreprodWallet();
  const { wallet, seed, keystore, shieldedSecretKeys, dustSecretKey, zkConfigProvider, keyMaterialProvider, synced } =
    ctx;

  await ensureDust(ctx);

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
      const signed = await wallet.signRecipe(recipe, (payload) => keystore.signData(payload));
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
      accountId: keystore.getBech32Address().asString(),
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

  await ctx.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Deploy hatası:', err);
  process.exit(1);
});
