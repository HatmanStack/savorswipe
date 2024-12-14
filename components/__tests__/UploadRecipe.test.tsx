// UploadRecipe.test.tsx
import { resizeImage, callLambdaFunction } from '../UploadRecipe';
import * as ImageManipulator from 'expo-image-manipulator';
import AWS from 'aws-sdk';

// Existing mocks
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg'
  }
}));

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  Lambda: jest.fn()
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  manifest: {
    extra: {
      AWS_REGION_LAMBDA: 'test-region',
      AWS_ID: 'test-id',
      AWS_SECRET: 'test-secret',
      AWS_LAMBDA_FUNCTION: 'test-function'
    }
  }
}));

describe('UploadRecipe', () => {
  describe('resizeImage', () => {
    it('should resize an image and return base64 string', async () => {
      const mockUri = 'fake-image-uri';
      const mockBase64 = 'base64-string';
      const mockMaxSize = 2000;

      // Mock the manipulateAsync function
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
        base64: mockBase64,
        uri: 'resized-image-uri',
        width: mockMaxSize,
        height: mockMaxSize
      });

      const result = await resizeImage(mockUri, mockMaxSize);

      // Verify the function was called with correct parameters
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        mockUri,
        [{ resize: { width: mockMaxSize, height: mockMaxSize } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Verify the result
      expect(result).toBe(mockBase64);
    });
  });

  describe('callLambdaFunction', () => {
    it('should successfully invoke Lambda and return parsed response', async () => {
      const mockBase64Image = 'test-base64-image';
      const mockLambdaResponse = {
        Payload: JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({ message: 'Success', data: 'test-data' })
        })
      };

      // Mock Lambda invoke method
      const mockInvoke = jest.fn().mockReturnValue({
        promise: () => Promise.resolve(mockLambdaResponse)
      });

      (AWS.Lambda as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke
      }));

      const result = await callLambdaFunction(mockBase64Image);

      // Verify Lambda was called with correct parameters
      expect(mockInvoke).toHaveBeenCalledWith({
        FunctionName: 'test-function',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          base64: mockBase64Image
        })
      });

      // Verify the returned result
      expect(result).toEqual({
        message: 'Success',
        data: 'test-data'
      });
    });

    it('should handle Lambda invocation errors', async () => {
      const mockBase64Image = 'test-base64-image';
      
      // Mock Lambda invoke method to throw an error
      const mockInvoke = jest.fn().mockReturnValue({
        promise: () => Promise.reject(new Error('Lambda invocation failed'))
      });

      (AWS.Lambda as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke
      }));

      const result = await callLambdaFunction(mockBase64Image);

      // Verify error handling
      expect(result).toEqual({ returnMessage: "Upload Failed" });
    });
  });


});