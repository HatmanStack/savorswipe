// GetImages.test.tsx
import { render } from '@testing-library/react-native';
import GetImages, { getJsonFromS3, fetchFromS3 } from '../GetImages';
import { S3 } from 'aws-sdk';
import { RecipeProvider } from '@/context/RecipeContext';

// Mock dependencies
jest.mock('aws-sdk');
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      AWS_S3_BUCKET: 'test-bucket',
      AWS_REGION_S3: 'test-region',
      AWS_ID: 'test-id',
      AWS_SECRET: 'test-secret'
    }
  }
}));

describe('getJsonFromS3', () => {
  it('should successfully fetch and parse JSON from S3', async () => {
    const mockData = { test: 'data' };
    const mockGetObject = jest.fn().mockReturnValue({
      promise: () => Promise.resolve({
        Body: Buffer.from(JSON.stringify(mockData))
      })
    });

    (S3 as jest.Mock).mockImplementation(() => ({
      getObject: mockGetObject
    }));

    const result = await getJsonFromS3();
    expect(result).toEqual(mockData);
    expect(mockGetObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'jsondata/combined_data.json'
    });
  });

  it('should handle S3 errors and throw them', async () => {
    const mockError = new Error('S3 access denied');
    const mockGetObject = jest.fn().mockReturnValue({
      promise: () => Promise.reject(mockError)
    });

    (S3 as jest.Mock).mockImplementation(() => ({
      getObject: mockGetObject
    }));

    await expect(getJsonFromS3()).rejects.toThrow('S3 access denied');
    expect(mockGetObject).toHaveBeenCalled();
  });

  describe('fetchFromS3', () => {
    it('should successfully fetch a file from S3', async () => {
      const mockFileContent = Buffer.from('mock image data');
      const mockGetObject = jest.fn().mockReturnValue({
        promise: () => Promise.resolve({
          Body: mockFileContent
        })
      });

      (S3 as jest.Mock).mockImplementation(() => ({
        getObject: mockGetObject
      }));

      const fileName = 'test-image.jpg';
      const result = await fetchFromS3(fileName);

      expect(result).toEqual(mockFileContent);
      expect(mockGetObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: fileName
      });
    });
  });

  describe('GetImages Component', () => {
    it('should initialize correctly and fetch initial data', () => {
      const mockSetImageDimensions = jest.fn();
      const mockSetFetchImage = jest.fn();
      
      const props = {
        getNewList: false,
        fetchImage: false,
        setFetchImage: mockSetFetchImage,
        setImageDimensions: mockSetImageDimensions
      };
  
      render(
        <RecipeProvider>
          <GetImages {...props} />
        </RecipeProvider>
      );
  
      // Check if setImageDimensions was called with window dimensions
      expect(mockSetImageDimensions).toHaveBeenCalledWith(
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number)
        })
      );
    });
  });

});