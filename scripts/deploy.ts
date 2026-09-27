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

import * as fs from 'node:fs';
import * as path from 'node:path';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

import { createBursPrivateState } from '../src/witnesses.js';
import { PRIVATE_STATE_ID, compiledBursContract, makeContractProviders } from './contract.js';
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
  await ensureDust(ctx);

  const providers = makeContractProviders(ctx);
  const compiledContract = compiledBursContract();

  console.log(`⏳ Sözleşme deploy ediliyor (threshold = ${INITIAL_THRESHOLD} TL)...`);
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    // The deployer never proves eligibility, so its local income is irrelevant.
    initialPrivateState: createBursPrivateState(0n, new Uint8Array(32)),
    args: [INITIAL_THRESHOLD],
  });

  const { contractAddress, txHash, txId, blockHeight } = deployed.deployTxData.public;

  console.log('\n🎉 DEPLOY BAŞARILI');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📍 Contract address : ${contractAddress}`);
  console.log(`🧾 Transaction hash : ${txHash}`);
  console.log(`📦 Block height     : ${blockHeight}`);
  console.log(`🌐 Network          : ${CONFIG.networkId}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const deploymentInfo = {
    network: CONFIG.networkId,
    contractAddress,
    txHash,
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
