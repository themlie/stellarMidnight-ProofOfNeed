// isomorphic-ws' browser entry only has a default export, but the indexer
// provider imports { WebSocket } from it. Re-export the browser's WebSocket.
const WS = globalThis.WebSocket;
export { WS as WebSocket };
export default WS;
