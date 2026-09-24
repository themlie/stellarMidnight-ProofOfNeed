import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type ChargedState,
  ContractState,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, type Ledger } from '../managed/burs_eligibility/contract/index.js';
import { createBursPrivateState, witnesses, type BursPrivateState } from '../src/witnesses.js';

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
    const { currentContractState } = await sim.contract.initialState(
      createConstructorContext(createBursPrivateState(0n), DUMMY_COIN_PUBLIC_KEY),
      threshold,
    );
    sim.state = currentContractState;
    return sim;
  }

  /** Calls check_eligibility with `income` as the student's private witness. */
  async checkEligibility(income: bigint): Promise<boolean> {
    const context = createCircuitContext(
      'check_eligibility',
      this.address,
      DUMMY_COIN_PUBLIC_KEY,
      this.state,
      createBursPrivateState(income),
    );
    const { result, context: after } = await this.contract.circuits.check_eligibility(context);
    this.state = after.callContext.currentQueryContext.state;
    return result;
  }

  getLedger(): Ledger {
    return ledger(this.state instanceof ContractState ? this.state.data : this.state);
  }
}
