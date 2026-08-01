// Polyfill expo 55 globals for jest
// Must run before test framework loads modules

// Non-configurable so expo 57's winter runtime leaves it alone: installGlobal
// skips a property it cannot redefine, and its replacement is a lazy getter
// that `import`s outside the test scope the first time anything reads it.
Object.defineProperty(globalThis, '__ExpoImportMetaRegistry', {
  value: {
    register: () => {},
    get: () => ({}),
  },
  configurable: false,
  writable: true,
  enumerable: false,
});

// Jest 30 VM sandbox may not expose structuredClone. Pinned like the registry
// above so expo's winter runtime leaves the working implementation in place.
Object.defineProperty(globalThis, 'structuredClone', {
  value:
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone
      : (val) => JSON.parse(JSON.stringify(val)),
  configurable: false,
  writable: true,
  enumerable: false,
});

// Prevent react-native requestAnimationFrame from crashing after jest teardown
// RN 0.84 uses jest.now() in requestAnimationFrame which throws after teardown
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
