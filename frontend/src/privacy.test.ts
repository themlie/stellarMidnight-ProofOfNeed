import { describe, expect, it } from 'vitest';

import {
  containsBytes,
  describeError,
  findIncomeInTx,
  fromHex,
  isMissingDust,
  toHex,
  uint64Encodings,
} from './privacy';

/** A fake "transaction": random-looking bytes with an optional value spliced in. */
const txWith = (inserted?: Uint8Array, at = 100): Uint8Array => {
  const tx = new Uint8Array(512);
  for (let i = 0; i < tx.length; i++) tx[i] = (i * 37 + 11) % 251 || 1; // no zero bytes
  if (inserted) tx.set(inserted, at);
  return tx;
};

describe('hex helpers', () => {
  it('round-trips bytes through hex', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 127, 255]);
    expect(toHex(bytes)).toBe('00010f107fff');
    expect(fromHex(toHex(bytes))).toEqual(bytes);
  });

  it('rejects malformed hex', () => {
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });
});

describe('containsBytes', () => {
  it('finds a needle at the start, middle and end', () => {
    const hay = Uint8Array.from([1, 2, 3, 4, 5]);
    expect(containsBytes(hay, Uint8Array.from([1, 2]))).toBe(true);
    expect(containsBytes(hay, Uint8Array.from([3, 4]))).toBe(true);
    expect(containsBytes(hay, Uint8Array.from([4, 5]))).toBe(true);
  });

  it('does not match partial or overflowing needles', () => {
    const hay = Uint8Array.from([1, 2, 3]);
    expect(containsBytes(hay, Uint8Array.from([2, 4]))).toBe(false);
    expect(containsBytes(hay, Uint8Array.from([3, 4]))).toBe(false);
    expect(containsBytes(hay, Uint8Array.from([1, 2, 3, 4]))).toBe(false);
  });
});

describe('findIncomeInTx (privacy check)', () => {
  const income = 8500n;
  const [le, be] = uint64Encodings(income);

  it('encodes the income as 64-bit little- and big-endian', () => {
    expect(toHex(le)).toBe('3421000000000000');
    expect(toHex(be)).toBe('0000000000002134');
  });

  it('reports not-found when the income is absent', () => {
    expect(findIncomeInTx(txWith(), income)).toBe('not-found');
  });

  it('reports found for either byte order', () => {
    expect(findIncomeInTx(txWith(le), income)).toBe('found');
    expect(findIncomeInTx(txWith(be, 300), income)).toBe('found');
  });

  it('finds the income at the very end of the transaction', () => {
    expect(findIncomeInTx(txWith(le, 512 - 8), income)).toBe('found');
  });

  it('is inconclusive for incomes whose encoding is mostly zero bytes', () => {
    // 0 and small values encode to runs of zeros that occur in any transaction.
    expect(findIncomeInTx(txWith(), 0n)).toBe('inconclusive');
    expect(findIncomeInTx(txWith(), 255n)).toBe('inconclusive');
    expect(findIncomeInTx(txWith(), 256n)).toBe('not-found');
  });
});

describe('describeError', () => {
  it('uses the message of a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('flattens the cause chain and Lace style code/reason objects', () => {
    const lace = { code: 'Rejected', reason: 'User rejected the transaction' };
    const wrapped = new Error('Lace submitTransaction failed', { cause: lace });
    expect(describeError(wrapped)).toBe(
      'Lace submitTransaction failed ← code=Rejected reason=User rejected the transaction',
    );
  });

  it('falls back to JSON for message-less objects', () => {
    const fiber = { _id: 'FiberFailure', cause: { _tag: 'Wallet.InsufficientFunds', tokenType: 'dust' } };
    const text = describeError(fiber);
    expect(text).toContain('FiberFailure');
    expect(text).toContain('Wallet.InsufficientFunds');
  });

  it('survives circular objects and non-object causes', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(describeError(new Error('outer', { cause: 'inner text' }))).toBe('outer ← inner text');
  });
});

describe('isMissingDust', () => {
  it('recognises the wallet insufficient-DUST error', () => {
    const detail = describeError({ _tag: 'Wallet.InsufficientFunds', message: 'Insufficient Funds: could not balance dust' });
    expect(isMissingDust(detail)).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isMissingDust('Wallet.InsufficientFunds night')).toBe(false);
    expect(isMissingDust('proof server unreachable')).toBe(false);
  });
});
