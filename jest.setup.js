// jest.setup.js
import '@testing-library/jest-native/extend-expect';

jest.mock('aws-sdk');

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
    }
  }
}));

// Mock react-native's Dimensions
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn().mockReturnValue({ width: 375, height: 812 })
}));