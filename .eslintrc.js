// https://docs.expo.dev/guides/using-eslint/
/* eslint-disable no-undef */
module.exports = {
  extends: 'expo',
  env: {
    node: true,
  },
  ignorePatterns: [
    'babel.config.js',
    '.eslintrc.js',
    'jest.setup.js',
    'scripts/**/*.js',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
};
