import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../managed/burs_eligibility/contract/index.js';

/**
 * Private state kept only on the student's machine.
 * - `income` feeds the `familyIncome` witness.
 * - `secret` feeds the `studentSecret` witness; its hash is the application
 *   nullifier that stops the same student from applying twice.
 * Neither value is written to the ledger or sent to the network.
 */
export type BursPrivateState = {
  readonly income: bigint;
  readonly secret: Uint8Array;
};

export const createBursPrivateState = (income: bigint, secret: Uint8Array): BursPrivateState => ({ income, secret });

/** A fresh 32-byte student secret. */
export const randomStudentSecret = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

export const witnesses = {
  familyIncome: ({ privateState }: WitnessContext<Ledger, BursPrivateState>): [BursPrivateState, bigint] => [
    privateState,
    privateState.income,
  ],
  studentSecret: ({ privateState }: WitnessContext<Ledger, BursPrivateState>): [BursPrivateState, Uint8Array] => [
    privateState,
    privateState.secret,
  ],
};
