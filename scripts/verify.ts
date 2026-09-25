/**
 * Reads the deployed BursEligibility contract back from the Preprod indexer and
 * decodes its public ledger state.
 *
 * Usage: npm run verify [contract-address]
 * Without an argument the address is taken from deployment-preprod.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContractState } from '@midnight-ntwrk/compact-runtime';

import { ledger } from '../managed/burs_eligibility/contract/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEXER_URL = 'https://indexer.preprod.midnight.network/api/v4/graphql';

const address =
  process.argv[2] ??
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'deployment-preprod.json'), 'utf8')) as { contractAddress: string })
    .contractAddress;

const query = `{
  contractAction(address: "${address}") {
    __typename
    state
    transaction { hash block { height timestamp } }
  }
}`;

const response = await fetch(INDEXER_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
});
const action = (await response.json()).data?.contractAction;

if (!action) {
  console.error(`❌ No contract found on Preprod at ${address}`);
  process.exit(1);
}

const state = ContractState.deserialize(Buffer.from(action.state, 'hex'));
const { threshold, totalChecks, eligibleCount } = ledger(state.data);

console.log('🌑 ProofOfNeed — on-chain verification (Midnight Preprod)\n');
console.log(`📍 Contract address : ${address}`);
console.log(`🧾 Deploy tx        : ${action.transaction.hash}`);
console.log(`📦 Block            : ${action.transaction.block.height} (${new Date(action.transaction.block.timestamp).toISOString()})`);
console.log(`⚙️  Circuits         : ${state.operations().join(', ')}`);
console.log('\n📖 Public ledger state');
console.log(`   threshold      = ${threshold}`);
console.log(`   totalChecks    = ${totalChecks}`);
console.log(`   eligibleCount  = ${eligibleCount}`);
console.log('\n🔒 Family income is a private witness and is not part of the ledger.');
