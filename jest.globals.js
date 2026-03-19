// Polyfill expo 55 globals for jest
// Must run before test framework loads modules

if (!globalThis.__ExpoImportMetaRegistry) {
  globalThis.__ExpoImportMetaRegistry = {
    register: () => {},
    get: () => ({}),
  };
}

// Jest 30 VM sandbox may not expose structuredClone
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

// Prevent react-native requestAnimationFrame from crashing after jest teardown
// RN 0.84 uses jest.now() in requestAnimationFrame which throws after teardown
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
