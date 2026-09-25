// Minimal stand-in for Node's `assert`, which some transitive dependencies import.
function assert(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? 'Assertion failed');
}
assert.ok = assert;
assert.equal = (a: unknown, b: unknown, message?: string) => assert(a == b, message);
assert.strictEqual = (a: unknown, b: unknown, message?: string) => assert(a === b, message);
export default assert;
export { assert as ok };
