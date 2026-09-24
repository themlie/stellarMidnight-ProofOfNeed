import { BursSimulator } from './simulator.js';

// Threshold set by the donor/foundation at deploy time: 10000 TL.
const THRESHOLD = 10000n;

describe('BursEligibility contract', () => {
  let sim: BursSimulator;

  beforeEach(async () => {
    sim = await BursSimulator.deploy(THRESHOLD);
  });

  it('stores the threshold in public ledger state at deploy', () => {
    const state = sim.getLedger();
    expect(state.threshold).toBe(THRESHOLD);
    expect(state.totalChecks).toBe(0n);
    expect(state.eligibleCount).toBe(0n);
  });

  it('is eligible when income is below the threshold', async () => {
    expect(await sim.checkEligibility(8000n)).toBe(true);
  });

  it('is not eligible when income is above the threshold', async () => {
    expect(await sim.checkEligibility(15000n)).toBe(false);
  });

  it('is not eligible when income equals the threshold (boundary)', async () => {
    expect(await sim.checkEligibility(THRESHOLD)).toBe(false);
  });

  it('is eligible for zero income', async () => {
    expect(await sim.checkEligibility(0n)).toBe(true);
  });

  it('records only counts on the ledger, never the income', async () => {
    await sim.checkEligibility(8000n);
    await sim.checkEligibility(9999n);
    await sim.checkEligibility(12345n);

    const state = sim.getLedger();
    expect(state.totalChecks).toBe(3n);
    expect(state.eligibleCount).toBe(2n);
    // Public state exposes exactly these fields and nothing income-related.
    expect(Object.keys(state).sort()).toEqual(['eligibleCount', 'threshold', 'totalChecks']);
  });
});
