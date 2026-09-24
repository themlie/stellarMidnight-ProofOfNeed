import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  familyIncome(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  check_eligibility(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
}

export type ProvableCircuits<PS> = {
  check_eligibility(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  check_eligibility(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
}

export type Ledger = {
  readonly threshold: bigint;
  readonly totalChecks: bigint;
  readonly eligibleCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initial_threshold_0: bigint): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
