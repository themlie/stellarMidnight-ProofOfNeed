/**
 * Registers the script wallet's *unregistered* tNIGHT so that the DUST it
 * generates goes to another wallet.
 *
 * Usage:
 *   npm run redirect-dust -- <dust-address>   # e.g. a Lace wallet's mn_dust_preprod1... address
 *
 * Useful when a browser wallet holds tNIGHT but cannot register it for DUST
 * generation itself. Already-registered tNIGHT is left alone: deregistering it
 * is rejected by the node with BalanceCheckOverspend (error 138) on the current
 * SDK, so instead send fresh tNIGHT from the faucet to the script wallet and
 * register that. The script waits for it if none is available.
 */

import { DustAddress, MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';

import { CONFIG, openPreprodWallet, registerForDust, waitFor } from './wallet.js';

const parseDustAddress = (bech32: string): DustAddress => {
  try {
    return DustAddress.codec.decode(CONFIG.networkId, MidnightBech32m.parse(bech32));
  } catch (err) {
    throw new Error(`"${bech32}" is not a ${CONFIG.networkId} DUST address: ${(err as Error).message}`);
  }
};

const hasUnregistered = (coins: readonly { meta: { registeredForDustGeneration: boolean } }[]) =>
  coins.some((c) => !c.meta.registeredForDustGeneration);

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Kullanım: npm run redirect-dust -- <mn_dust_preprod1... adresi>');
    process.exit(1);
  }
  const receiver = parseDustAddress(target);
  console.log(`🌑 Yeni tNIGHT'ın DUST üretimi şu adrese yönlendirilecek: ${target}\n`);

  const ctx = await openPreprodWallet();

  if (!hasUnregistered(ctx.synced.unshielded.availableCoins)) {
    console.log('💧 Kayıtsız tNIGHT yok. Faucet\'ten bu cüzdana tNIGHT isteyin:');
    console.log(`   ${CONFIG.faucetUrl}`);
    console.log(`   Adres: ${ctx.keystore.getBech32Address().asString()}\n`);
    console.log('⏳ Yeni tNIGHT bekleniyor (script açık kalabilir)...');
    await waitFor(ctx.wallet, (s) => hasUnregistered(s.unshielded.availableCoins));
    console.log('✅ Yeni tNIGHT geldi\n');
  }

  console.log('⏳ Kayıtsız tNIGHT, DUST hedef adrese üretilecek şekilde kaydediliyor...');
  const txId = await registerForDust(ctx, receiver);
  console.log(`✅ Kayıt işlemi gönderildi: ${txId}`);
  await waitFor(ctx.wallet, (s) => !hasUnregistered(s.unshielded.availableCoins));
  console.log('\n🎉 Tamamlandı. DUST birkaç dakika içinde hedef cüzdanda birikmeye başlar.');

  await ctx.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Hata:', err);
  process.exit(1);
});
