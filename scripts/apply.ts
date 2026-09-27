/**
 * Submits a real check_eligibility call to the deployed contract on Preprod,
 * using the script wallet to pay fees.
 *
 * Usage:
 *   npm run apply -- <income>            # apply as a new student (fresh secret)
 *   npm run apply -- <income> --again    # re-use the last secret: must be refused
 *
 * The income and the student secret are private witnesses. The script prints
 * what became public: the yes/no result, the nullifier and the new ledger.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { ledger, pureCircuits } from '../managed/burs_eligibility/contract/index.js';
import { createBursPrivateState, randomStudentSecret } from '../src/witnesses.js';
import { PRIVATE_STATE_ID, compiledBursContract, makeContractProviders } from './contract.js';
import { ROOT, openPreprodWallet } from './wallet.js';

const SECRET_FILE = path.join(ROOT, '.wallet-cache', 'last-student-secret.hex');
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

async function main() {
  const [incomeArg, flag] = process.argv.slice(2);
  if (!incomeArg || !/^\d+$/.test(incomeArg)) {
    console.error('Kullanım: npm run apply -- <gelir> [--again]');
    process.exit(1);
  }
  const income = BigInt(incomeArg);
  const again = flag === '--again';

  const { contractAddress } = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployment-preprod.json'), 'utf8')) as {
    contractAddress: string;
  };

  let secret: Uint8Array;
  if (again) {
    if (!fs.existsSync(SECRET_FILE)) throw new Error('No previous student secret; run without --again first.');
    secret = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
  } else {
    secret = randomStudentSecret();
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, toHex(secret));
  }
  const nullifier = pureCircuits.applicationNullifier(secret);

  console.log('🌑 ProofOfNeed — eligibility check on Midnight Preprod\n');
  console.log(`📍 Contract          : ${contractAddress}`);
  console.log(`🔒 Income (private)  : ${income}  (never leaves this machine)`);
  console.log(`🏷️  Nullifier (public): ${toHex(nullifier)}${again ? '  (same student again)' : ''}\n`);

  const ctx = await openPreprodWallet();
  const providers = makeContractProviders(ctx);

  const before = await providers.publicDataProvider.queryContractState(contractAddress);
  if (before && ledger(before.data).applications.member(nullifier)) {
    console.log('⛔ Already applied: this nullifier is on-chain, so the contract would refuse the proof.');
    console.log('   Running the circuit anyway to show the refusal...\n');
  }

  const contract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledBursContract(),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: createBursPrivateState(income, secret),
  });
  // findDeployedContract only stores the initial state when none exists yet.
  providers.privateStateProvider.setContractAddress(contractAddress);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, createBursPrivateState(income, secret));

  try {
    console.log('⏳ Proving check_eligibility and submitting...');
    const tx = await contract.callTx.check_eligibility();
    const after = await providers.publicDataProvider.queryContractState(contractAddress);
    const state = after ? ledger(after.data) : undefined;

    console.log(`\n${tx.private.result ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE'}  (income ${tx.private.result ? '<' : '>='} threshold)`);
    console.log(`🧾 Transaction hash : ${tx.public.txHash}`);
    console.log(`📦 Block            : ${tx.public.blockHeight}`);
    if (state) {
      console.log('\n📖 Public ledger now');
      console.log(`   threshold      = ${state.threshold}`);
      console.log(`   totalChecks    = ${state.totalChecks}`);
      console.log(`   eligibleCount  = ${state.eligibleCount}`);
      console.log(`   applications   = ${state.applications.size()} nullifier(s)`);
      console.log(`   our nullifier on-chain: ${state.applications.member(nullifier)}`);
    }
  } catch (err) {
    const text = String(err);
    if (/Already applied/.test(text)) {
      console.log('\n⛔ Refused: "Already applied". The circuit fails against the on-chain nullifier set,');
      console.log('   so no proof is generated, nothing is submitted and no fee is paid.');
    } else {
      throw err;
    }
  } finally {
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, createBursPrivateState(0n, new Uint8Array(32)));
    await ctx.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Hata:', err);
  process.exit(1);
});
