const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force tslib to resolve to the ES module version
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib' || moduleName.includes('tslib.js')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve('tslib/tslib.es6.mjs'),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
