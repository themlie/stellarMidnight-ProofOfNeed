// Midnight integration for the ProofOfNeed frontend: Lace connection, contract
// providers, the check_eligibility call and public ledger reads.

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { ContractAddress, SigningKey } from '@midnight-ntwrk/compact-runtime';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  CostModel,
  Transaction,
  type Binding,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  type TransactionId,
} from '@midnight-ntwrk/ledger-v8';
import { findDeployedContract, type ContractProviders, type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type {
  MidnightProvider,
  PrivateStateId,
  ProofProvider,
  PrivateStateProvider,
  PublicDataProvider,
  UnboundTransaction,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import {
  MidnightBech32m,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';

import { Contract, ledger, pureCircuits, type Ledger } from '../../managed/burs_eligibility/contract/index.js';
import deployment from '../../deployment-preprod.json';
import { describeError, fromHex, toHex } from './privacy';
import { loadOrCreateSecret } from './secret';
import {
  createBursPrivateState,
  randomStudentSecret,
  witnesses,
  type BursPrivateState,
} from '../../src/witnesses.js';

export const NETWORK_ID = 'preprod';
export const CONTRACT_ADDRESS: ContractAddress = deployment.contractAddress;
const PRIVATE_STATE_ID = 'burs-eligibility';

type BursContract = Contract<BursPrivateState>;

export type WalletInfo = {
  name: string;
  apiVersion: string;
  unshieldedAddress: string;
  shieldedAddress: string;
  dustAddress: string;
  dustBalance: bigint;
  /** Where Lace sends proving requests (the witness data goes here, not to the network). */
  proverServerUri?: string;
};

export type EligibilityResult = {
  eligible: boolean;
  /** Public, one-per-student tag derived from the local secret. */
  nullifier: string;
  txId: string;
  blockHeight: number;
  /** The exact bytes handed to Lace for submission to the network. */
  submittedTx: Uint8Array;
};

/** Labels a failing Lace call with the step it belongs to. */
const laceStep = async <T>(step: string, call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (err) {
    console.error(`[ProofOfNeed] ${step} failed`, err);
    throw new Error(`${step} failed: ${describeError(err)}`, { cause: err });
  }
};

// ─── Student secret ───────────────────────────────────────────────────────────
// The secret behind the application nullifier. It is kept in this browser's
// localStorage (per contract) so the same student gets the same nullifier on
// every visit; it is never sent anywhere. Clearing site data forgets it.

const secretKey = () => `proofofneed:student-secret:${CONTRACT_ADDRESS}`;

export const loadStudentSecret = (): Uint8Array =>
  loadOrCreateSecret(typeof localStorage === 'undefined' ? undefined : localStorage, secretKey(), randomStudentSecret);

export const nullifierHex = (secret: Uint8Array): string => toHex(pureCircuits.applicationNullifier(secret));

// ─── In-memory private state ──────────────────────────────────────────────────
// The student's income only ever lives in this Map for the lifetime of the tab.
// Nothing is persisted to IndexedDB or localStorage.

const inMemoryPrivateStateProvider = (): PrivateStateProvider<PrivateStateId, BursPrivateState> => {
  const states = new Map<string, BursPrivateState>();
  const signingKeys = new Map<string, SigningKey>();
  let scope = '';
  const unsupported = () => Promise.reject(new Error('Private state export/import is disabled'));
  return {
    setContractAddress: (address) => void (scope = address),
    set: async (id, state) => void states.set(`${scope}:${id}`, state),
    get: async (id) => states.get(`${scope}:${id}`) ?? null,
    remove: async (id) => void states.delete(`${scope}:${id}`),
    clear: async () => states.clear(),
    setSigningKey: async (address, key) => void signingKeys.set(address, key),
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => void signingKeys.delete(address),
    clearSigningKeys: async () => signingKeys.clear(),
    exportPrivateStates: unsupported,
    importPrivateStates: unsupported,
    exportSigningKeys: unsupported,
    importSigningKeys: unsupported,
  };
};

// ─── Wallet discovery and connection ──────────────────────────────────────────

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

/** Returns the first injected wallet that implements DApp connector API v4. */
export const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find((w) => typeof w?.connect === 'function' && w.apiVersion?.startsWith('4.'));


/** Proof provider backed by Lace's prover, with the proving step labelled in errors. */
const laceProofProvider = async (
  api: ConnectedAPI,
  zkConfigProvider: FetchZkConfigProvider<'check_eligibility'>,
): Promise<ProofProvider> => {
  const inner = await laceStep('Lace getProvingProvider', () =>
    dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel()),
  );
  return {
    proveTx: (tx, config) => laceStep("ZK proof via Lace's prover", () => inner.proveTx(tx, config)),
  };
};

/** Raised before submitting when this student's nullifier is already on-chain. */
export class AlreadyAppliedError extends Error {
  constructor(readonly nullifier: string) {
    super(`Already applied (nullifier ${nullifier})`);
    this.name = 'AlreadyAppliedError';
  }
}

export { describeError, findIncomeInTx, isMissingDust } from './privacy';

export class ProofOfNeedSession {
  private contract?: FoundContract<BursContract>;

  private constructor(
    readonly wallet: InitialAPI,
    readonly api: ConnectedAPI,
    readonly info: WalletInfo,
    private readonly privateState: PrivateStateProvider<PrivateStateId, BursPrivateState>,
    readonly publicData: PublicDataProvider,
    private readonly providers: ContractProviders<BursContract>,
    private readonly submitted: { bytes: Uint8Array },
  ) {}

  /** Asks Lace for permission and builds all Midnight providers on top of it. */
  static async connect(wallet: InitialAPI): Promise<ProofOfNeedSession> {
    const api = await wallet.connect(NETWORK_ID);
    const config = await api.getConfiguration();
    if (config.networkId !== NETWORK_ID) {
      throw new Error(`Lace is on "${config.networkId}". Switch Lace to Preprod and reconnect.`);
    }
    setNetworkId(NETWORK_ID);

    const [shielded, { unshieldedAddress }, { dustAddress }, dust] = await Promise.all([
      api.getShieldedAddresses(),
      api.getUnshieldedAddress(),
      api.getDustAddress(),
      api.getDustBalance(),
    ]);

    // Lace hands out Bech32m keys; midnight-js expects them hex encoded.
    const coinPublicKey = ShieldedCoinPublicKey.codec
      .decode(NETWORK_ID, MidnightBech32m.parse(shielded.shieldedCoinPublicKey))
      .toHexString();
    const encryptionPublicKey = ShieldedEncryptionPublicKey.codec
      .decode(NETWORK_ID, MidnightBech32m.parse(shielded.shieldedEncryptionPublicKey))
      .toHexString();

    const submitted: { bytes: Uint8Array } = { bytes: new Uint8Array() };

    // Lace balances (adds DUST fees), signs and submits every transaction.
    const walletProvider: WalletProvider & MidnightProvider = {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => encryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const { tx: balanced } = await laceStep('Lace balanceUnsealedTransaction (adding DUST fees)', () =>
          api.balanceUnsealedTransaction(toHex(tx.serialize())),
        );
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(balanced));
      },
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        submitted.bytes = tx.serialize();
        await laceStep('Lace submitTransaction', () => api.submitTransaction(toHex(submitted.bytes)));
        return tx.identifiers()[0];
      },
    };

    const zkConfigProvider = new FetchZkConfigProvider<'check_eligibility'>(
      `${window.location.origin}/burs_eligibility`,
      fetch.bind(window),
    );
    const privateState = inMemoryPrivateStateProvider();
    const publicData = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);

    const providers = {
      privateStateProvider: privateState,
      publicDataProvider: publicData,
      zkConfigProvider,
      // Proofs are produced by the prover Lace is configured with.
      proofProvider: await laceProofProvider(api, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    const info: WalletInfo = {
      name: wallet.name,
      apiVersion: wallet.apiVersion,
      unshieldedAddress,
      shieldedAddress: shielded.shieldedAddress,
      dustAddress,
      dustBalance: dust.balance,
      proverServerUri: config.proverServerUri,
    };

    return new ProofOfNeedSession(wallet, api, info, privateState, publicData, providers, submitted);
  }

  private async deployedContract(): Promise<FoundContract<BursContract>> {
    this.contract ??= await findDeployedContract(this.providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract: CompiledContract.make('burs_eligibility', Contract).pipe(
        CompiledContract.withWitnesses(witnesses),
        CompiledContract.withCompiledFileAssets('/burs_eligibility'),
      ),
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: createBursPrivateState(0n, new Uint8Array(32)),
    });
    return this.contract;
  }

  /**
   * Proves `income < threshold` and submits the proof through Lace. The income
   * and the student secret are placed in in-memory private state, read by the
   * witnesses while proving, and wiped straight after.
   */
  async checkEligibility(income: bigint, secret: Uint8Array): Promise<EligibilityResult> {
    const nullifier = pureCircuits.applicationNullifier(secret);
    const current = await readPublicLedger(this.publicData);
    if (current?.applications.member(nullifier)) {
      throw new AlreadyAppliedError(toHex(nullifier));
    }

    const found = await this.deployedContract();
    this.privateState.setContractAddress(CONTRACT_ADDRESS);
    await this.privateState.set(PRIVATE_STATE_ID, createBursPrivateState(income, secret));
    try {
      const tx = await found.callTx.check_eligibility();
      return {
        eligible: tx.private.result,
        nullifier: toHex(nullifier),
        txId: tx.public.txId,
        blockHeight: tx.public.blockHeight,
        submittedTx: this.submitted.bytes,
      };
    } finally {
      await this.privateState.set(PRIVATE_STATE_ID, createBursPrivateState(0n, new Uint8Array(32)));
    }
  }

  async refreshDustBalance(): Promise<bigint> {
    this.info.dustBalance = (await this.api.getDustBalance()).balance;
    return this.info.dustBalance;
  }
}

const PREPROD_INDEXER = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const PREPROD_INDEXER_WS = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

/** Indexer access that works before any wallet is connected. */
export const preprodPublicData = (): PublicDataProvider => indexerPublicDataProvider(PREPROD_INDEXER, PREPROD_INDEXER_WS);

/** Reads the contract's public ledger straight from the Preprod indexer. */
export const readPublicLedger = async (publicData: PublicDataProvider): Promise<Ledger | null> => {
  const state = await publicData.queryContractState(CONTRACT_ADDRESS);
  return state ? ledger(state.data) : null;
};
