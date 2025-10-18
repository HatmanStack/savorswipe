// jest.setup.js
/* eslint-disable no-undef */
import '@testing-library/jest-native/extend-expect';

// Set environment variables for tests - MUST be before any module imports in tests
process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL = 'https://placeholder-lambda-url.execute-api.us-east-1.amazonaws.com';
process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL = 'https://test-cloudfront.cloudfront.net';

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