// Persistence of the student secret behind the application nullifier.

import { fromHex, toHex } from './privacy';

type SecretStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Returns the secret stored under `key`, creating and storing a new one if
 * there is none or the stored value is malformed. If storage is unavailable
 * (private window, blocked site data) the secret only lasts for this call.
 */
export const loadOrCreateSecret = (
  storage: SecretStorage | undefined,
  key: string,
  generate: () => Uint8Array,
): Uint8Array => {
  try {
    const stored = storage?.getItem(key);
    if (stored && /^[0-9a-f]{64}$/.test(stored)) return fromHex(stored);
  } catch {
    // Storage unavailable: fall through to a fresh secret.
  }
  const secret = generate();
  try {
    storage?.setItem(key, toHex(secret));
  } catch {
    // Storage unavailable: the secret is not persisted.
  }
  return secret;
};
