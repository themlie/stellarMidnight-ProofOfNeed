import { describe, expect, it } from 'vitest';

import { pureCircuits } from '../../managed/burs_eligibility/contract/index.js';
import { toHex } from './privacy';
import { loadOrCreateSecret } from './secret';

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

const counterSecrets = () => {
  let n = 0;
  return () => new Uint8Array(32).fill(++n);
};

describe('loadOrCreateSecret', () => {
  it('creates a secret once and returns the same one afterwards', () => {
    const storage = new MemoryStorage();
    const generate = counterSecrets();
    const first = loadOrCreateSecret(storage, 'k', generate);
    const second = loadOrCreateSecret(storage, 'k', generate);
    expect(second).toEqual(first);
    expect(storage.getItem('k')).toBe(toHex(first));
  });

  it('keeps separate secrets per key (one per contract)', () => {
    const storage = new MemoryStorage();
    const generate = counterSecrets();
    expect(loadOrCreateSecret(storage, 'contract-a', generate)).not.toEqual(
      loadOrCreateSecret(storage, 'contract-b', generate),
    );
  });

  it('replaces a malformed stored value', () => {
    const storage = new MemoryStorage();
    storage.setItem('k', 'not-a-secret');
    const secret = loadOrCreateSecret(storage, 'k', counterSecrets());
    expect(secret).toHaveLength(32);
    expect(storage.getItem('k')).toBe(toHex(secret));
  });

  it('still returns a secret when storage throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadOrCreateSecret(broken, 'k', counterSecrets())).toHaveLength(32);
    expect(loadOrCreateSecret(undefined, 'k', counterSecrets())).toHaveLength(32);
  });
});

describe('application nullifier', () => {
  const nullifier = (secret: Uint8Array) => pureCircuits.applicationNullifier(secret);

  it('is a stable 32-byte hash of the secret', () => {
    const secret = new Uint8Array(32).fill(7);
    expect(nullifier(secret)).toHaveLength(32);
    expect(nullifier(secret)).toEqual(nullifier(secret));
    expect(toHex(nullifier(secret))).not.toBe(toHex(secret));
  });

  it('differs between students', () => {
    expect(nullifier(new Uint8Array(32).fill(1))).not.toEqual(nullifier(new Uint8Array(32).fill(2)));
  });

  it('stays the same across visits because the secret is persisted', () => {
    const storage = new MemoryStorage();
    const generate = counterSecrets();
    const firstVisit = nullifier(loadOrCreateSecret(storage, 'k', generate));
    const secondVisit = nullifier(loadOrCreateSecret(storage, 'k', generate));
    expect(secondVisit).toEqual(firstVisit);
  });
});
