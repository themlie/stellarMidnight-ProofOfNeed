/**
 * Contract providers for the CLI scripts, built on the script wallet: the
 * wallet balances, signs and submits; proofs are made in-process with WASM
 * (or by PROOF_SERVER_URL when set).
 */

import { createHash } from 'node:crypto';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractProviders } from '@midnight-ntwrk/midnight-js-contracts';
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
import { witnesses, type BursPrivateState } from '../src/witnesses.js';
import { CONFIG, submitWithRetry, type PreprodWallet } from './wallet.js';

export type BursContract = Contract<BursPrivateState>;

export const PRIVATE_STATE_ID = 'burs-eligibility';

export const compiledBursContract = () =>
  CompiledContract.make('burs_eligibility', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(CONFIG.zkConfigDir),
  );

export const makeContractProviders = (ctx: PreprodWallet): ContractProviders<BursContract> => {
  const { wallet, seed, keystore, shieldedSecretKeys, dustSecretKey, zkConfigProvider, keyMaterialProvider, synced } =
    ctx;

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
    submitTx: (tx) => submitWithRetry(wallet, tx),
  };

  const proofProvider: ProofProvider = CONFIG.proofServerUrl
    ? httpClientProofProvider(CONFIG.proofServerUrl, zkConfigProvider)
    : createProofProvider(Effect.runSync(WasmProver.create({ keyMaterialProvider })).asProvingProvider());

  return {
    privateStateProvider: levelPrivateStateProvider<typeof PRIVATE_STATE_ID, BursPrivateState>({
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
};
