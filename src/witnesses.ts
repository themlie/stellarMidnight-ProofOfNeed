import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../managed/burs_eligibility/contract/index.js';

/**
 * Private state kept only on the student's machine.
 * `income` is fed to the circuit through the `familyIncome` witness and is
 * never written to the ledger or sent to the network.
 */
export type BursPrivateState = {
  readonly income: bigint;
};

export const createBursPrivateState = (income: bigint): BursPrivateState => ({ income });

export const witnesses = {
  familyIncome: ({ privateState }: WitnessContext<Ledger, BursPrivateState>): [BursPrivateState, bigint] => [
    privateState,
    privateState.income,
  ],
};
