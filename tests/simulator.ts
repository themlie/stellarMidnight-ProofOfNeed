import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type ChargedState,
  ContractState,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits, type Ledger } from '../managed/burs_eligibility/contract/index.js';
import { createBursPrivateState, randomStudentSecret, witnesses, type BursPrivateState } from '../src/witnesses.js';

const DUMMY_COIN_PUBLIC_KEY = '0'.repeat(64);

/**
 * Runs the compiled BursEligibility contract locally, without a node or proof
 * server, so circuit logic and ledger updates can be unit tested.
 */
export class BursSimulator {
  private readonly contract = new Contract<BursPrivateState>(witnesses);
  private readonly address = sampleContractAddress();
  private state!: ContractState | ChargedState;

  private constructor() {}

  static async deploy(threshold: bigint): Promise<BursSimulator> {
    const sim = new BursSimulator();
    const { currentContractState } = sim.contract.initialState(
      createConstructorContext(createBursPrivateState(0n, new Uint8Array(32)), DUMMY_COIN_PUBLIC_KEY),
      threshold,
    );
    sim.state = currentContractState;
    return sim;
  }

  /**
   * Calls check_eligibility with `income` and `secret` as the student's private
   * witnesses. A fresh secret (a new student) is used unless one is given.
   */
  async checkEligibility(income: bigint, secret: Uint8Array = randomStudentSecret()): Promise<boolean> {
    const context = createCircuitContext(
      this.address,
      DUMMY_COIN_PUBLIC_KEY,
      this.state,
      createBursPrivateState(income, secret),
    );
    const { result, context: after } = this.contract.circuits.check_eligibility(context);
    this.state = after.currentQueryContext.state;
    return result;
  }

  getLedger(): Ledger {
    return ledger(this.state instanceof ContractState ? this.state.data : this.state);
  }
}

export const nullifierOf = (secret: Uint8Array): Uint8Array => pureCircuits.applicationNullifier(secret);
