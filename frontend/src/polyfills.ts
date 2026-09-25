// Node globals expected by parts of the Midnight SDK. Imported before anything else.
import { Buffer } from 'buffer';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
(globalThis as unknown as { global: typeof globalThis }).global ??= globalThis;
