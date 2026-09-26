import { randomStudentSecret } from '../src/witnesses.js';
import { BursSimulator, nullifierOf } from './simulator.js';

// Threshold set by the donor/foundation at deploy time: 10000 TL.
const THRESHOLD = 10000n;

describe('BursEligibility contract', () => {
  let sim: BursSimulator;

  beforeEach(async () => {
    sim = await BursSimulator.deploy(THRESHOLD);
  });

  describe('eligibility', () => {
    it('stores the threshold in public ledger state at deploy', () => {
      const state = sim.getLedger();
      expect(state.threshold).toBe(THRESHOLD);
      expect(state.totalChecks).toBe(0n);
      expect(state.eligibleCount).toBe(0n);
      expect(state.applications.size()).toBe(0n);
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
  });

  describe('one application per student', () => {
    it('rejects a second application with the same secret', async () => {
      const secret = randomStudentSecret();
      await sim.checkEligibility(8000n, secret);

      await expect(sim.checkEligibility(8000n, secret)).rejects.toThrow(/Already applied/);
      expect(sim.getLedger().totalChecks).toBe(1n);
    });

    it('spends the nullifier even when the student is not eligible', async () => {
      const secret = randomStudentSecret();
      expect(await sim.checkEligibility(15000n, secret)).toBe(false);

      // Retrying with a lower income is refused, so the result cannot be gamed.
      await expect(sim.checkEligibility(5000n, secret)).rejects.toThrow(/Already applied/);
      expect(sim.getLedger().eligibleCount).toBe(0n);
    });

    it('accepts different students', async () => {
      await sim.checkEligibility(8000n);
      await sim.checkEligibility(9000n);
      expect(sim.getLedger().applications.size()).toBe(2n);
    });
  });

  describe('public ledger', () => {
    it('records counters and nullifiers, never the income or the secret', async () => {
      const secrets = [randomStudentSecret(), randomStudentSecret(), randomStudentSecret()];
      await sim.checkEligibility(8000n, secrets[0]);
      await sim.checkEligibility(9999n, secrets[1]);
      await sim.checkEligibility(12345n, secrets[2]);

      const state = sim.getLedger();
      expect(state.totalChecks).toBe(3n);
      expect(state.eligibleCount).toBe(2n);
      // Public state exposes exactly these fields and nothing income-related.
      expect(Object.keys(state).sort()).toEqual(['applications', 'eligibleCount', 'threshold', 'totalChecks']);

      for (const secret of secrets) {
        expect(state.applications.member(nullifierOf(secret))).toBe(true);
        expect(state.applications.member(secret)).toBe(false);
      }
    });

    it('derives a nullifier that differs from the secret and is stable', () => {
      const secret = randomStudentSecret();
      expect(nullifierOf(secret)).toEqual(nullifierOf(secret));
      expect(Buffer.from(nullifierOf(secret))).not.toEqual(Buffer.from(secret));
    });
  });
});
