// jest.setup.js
/* eslint-disable no-undef */
import '@testing-library/jest-native/extend-expect';

// Set environment variables for tests - MUST be before any module imports in tests
process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL = 'https://placeholder-lambda-url.execute-api.us-east-1.amazonaws.com';
process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL = 'https://test-cloudfront.cloudfront.net';

jest.mock('aws-sdk');

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    // Generate a simple UUID v4 for testing
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  })
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    manifest: {
      extra: {
        AWS_S3_BUCKET: 'test-bucket',
        AWS_REGION_S3: 'test-region',
        AWS_ID: 'test-id',
        AWS_SECRET: 'test-secret'
      }
    },
    expoConfig: {
      extra: {
        AWS_S3_BUCKET: 'test-bucket',
        AWS_REGION_S3: 'test-region',
        AWS_ID: 'test-id',
        AWS_SECRET: 'test-secret'
      }
    }
  },
  ExecutionEnvironment: {
    Standalone: 'standalone',
    StoreClient: 'storeClient',
    Bare: 'bare'
  }
}));

// Mock expo-asset
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(() => Promise.resolve()),
    })),
    loadAsync: jest.fn(() => Promise.resolve()),
  },
}));

// Mock expo-font
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// Mock react-native's Dimensions
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn().mockReturnValue({ width: 375, height: 812 })
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  mergeItem: jest.fn(() => Promise.resolve()),
  multiMerge: jest.fn(() => Promise.resolve()),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: Text,
    MaterialIcons: Text,
    FontAwesome: Text,
    Entypo: Text,
    AntDesign: Text,
    MaterialCommunityIcons: Text,
    Feather: Text,
    Foundation: Text,
    EvilIcons: Text,
    Octicons: Text,
    SimpleLineIcons: Text,
    Zocial: Text,
    FontAwesome5: Text,
  };
});