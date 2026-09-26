// SDK-free helpers behind the dApp's privacy check and error reporting.
// Kept separate from midnight.ts so they can be unit tested without WASM.

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error(`Not a hex string: ${hex.slice(0, 16)}`);
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
};

export const containsBytes = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length === 0) return true;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/** 64-bit encodings of a value, little- and big-endian. */
export const uint64Encodings = (value: bigint): [Uint8Array, Uint8Array] => {
  const le = new Uint8Array(8);
  new DataView(le.buffer).setBigUint64(0, value, true);
  return [le, le.slice().reverse()];
};

export type IncomeSearch =
  /** The value's bytes appear in the transaction. */
  | 'found'
  /** The value's bytes do not appear anywhere in the transaction. */
  | 'not-found'
  /**
   * The encoding is mostly zero bytes (income below 256), which occur in any
   * transaction by chance, so a byte search cannot tell anything.
   */
  | 'inconclusive';

/**
 * Searches a submitted transaction for the income encoded as a 64-bit integer
 * in both byte orders. Used to show the user that the value they typed is not
 * part of what was sent to the chain.
 */
export const findIncomeInTx = (tx: Uint8Array, income: bigint): IncomeSearch => {
  if (income < 256n) return 'inconclusive';
  const [le, be] = uint64Encodings(income);
  return containsBytes(tx, le) || containsBytes(tx, be) ? 'found' : 'not-found';
};

/**
 * Flattens an error and its cause chain into readable text. Lace rejects with
 * plain objects ({ code, reason }) or message-less Errors, which midnight-js
 * wraps as "...: Error"; this surfaces what actually went wrong.
 */
export const describeError = (err: unknown): string => {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 6; depth++) {
    if (typeof current === 'object') {
      const e = current as {
        name?: string;
        _tag?: string;
        message?: string;
        code?: unknown;
        reason?: unknown;
        cause?: unknown;
      };
      const fields = [
        e.name,
        // Effect errors carry their type in _tag (e.g. Wallet.InsufficientFunds).
        typeof e._tag === 'string' && e._tag !== e.name ? e._tag : '',
        e.message,
        e.code != null ? `code=${String(e.code)}` : '',
        e.reason != null ? `reason=${String(e.reason)}` : '',
      ]
        .filter((x) => x && x !== 'Error')
        .join(' ');
      let extra = '';
      if (!fields) {
        try {
          extra = JSON.stringify(current);
        } catch {
          extra = String(current);
        }
      }
      parts.push(fields || extra);
      current = e.cause;
    } else {
      parts.push(String(current));
      current = undefined;
    }
  }
  return parts.filter(Boolean).join(' ← ');
};

/** True when a flattened error says the wallet could not pay fees in DUST. */
export const isMissingDust = (detail: string): boolean => /InsufficientFunds/.test(detail) && /dust/i.test(detail);
