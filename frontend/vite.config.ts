import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  resolve: {
    // ../managed and ../src import these too; force a single copy so runtime
    // objects (ContractState, ChargedState, ...) are shared with the SDK.
    dedupe: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/ledger-v8',
    ],
    alias: {
      'isomorphic-ws': resolve(__dirname, 'src/shims/isomorphic-ws.ts'),
      assert: resolve(__dirname, 'src/shims/assert.ts'),
    },
  },
  build: {
    // Midnight's WASM modules rely on top-level await, which esnext supports natively.
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        howItWorks: resolve(__dirname, 'how-it-works.html'),
        faq: resolve(__dirname, 'faq.html'),
        about: resolve(__dirname, 'about.html'),
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    port: 4000,
    // The compiled contract lives in ../managed, outside the frontend root.
    fs: { allow: ['..'] },
  },
});
