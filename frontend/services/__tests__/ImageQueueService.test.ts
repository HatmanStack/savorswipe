import { ImageQueueService } from '../ImageQueueService';
import { ImageService } from '../ImageService';
import { RecipeService } from '../RecipeService';
import { S3JsonData, MealType } from '@/types';

// Mock dependencies
jest.mock('../ImageService');
jest.mock('../RecipeService');

describe('ImageQueueService', () => {
  // Stabilize test environment for RN globals
  beforeAll(() => {
    // RN global used in service logging paths
    (global as { __DEV__?: boolean }).__DEV__ = false;
    // Ensure revokeObjectURL exists in jsdom
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn() });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBatch', () => {
    it('should fetch images for provided recipe keys in parallel', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2', 'recipe3'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock).mockImplementation(
        (filename) => Promise.resolve(`blob:mock-${filename}`)
      );

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 3);

      // Assert
      expect(result.images).toHaveLength(3);
      expect(result.failedKeys).toHaveLength(0);
      expect(ImageService.getImageFromS3).toHaveBeenCalledTimes(3);
      expect(result.images[0]).toEqual({
        filename: 'images/recipe1.jpg',
        file: 'blob:mock-images/recipe1.jpg',
      });
    });

    it('should limit batch to batchSize parameter', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2', 'recipe3', 'recipe4', 'recipe5'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock).mockResolvedValue('blob:mock');

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 3);

      // Assert
      expect(result.images).toHaveLength(3);
      expect(ImageService.getImageFromS3).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2', 'recipe3'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock)
        .mockResolvedValueOnce('blob:recipe1')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('blob:recipe3');

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 3);

      // Assert
      expect(result.images).toHaveLength(2); // Only successful fetches
      expect(result.failedKeys).toContain('recipe2');
      expect(result.failedKeys).toHaveLength(1);
    });

    it('should return failedKeys for rejected promises', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2', 'recipe3'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('blob:recipe3');

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 3);

      // Assert
      expect(result.failedKeys).toEqual(['recipe1', 'recipe2']);
      expect(result.images).toHaveLength(1);
    });

    it('should return empty array if all fetches fail', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2', 'recipe3'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 3);

      // Assert
      expect(result.images).toHaveLength(0);
      expect(result.failedKeys).toEqual(['recipe1', 'recipe2', 'recipe3']);
    });

    it('should handle empty recipeKeys array', async () => {
      // Act
      const result = await ImageQueueService.fetchBatch([], 3);

      // Assert
      expect(result.images).toHaveLength(0);
      expect(result.failedKeys).toHaveLength(0);
      expect(ImageService.getImageFromS3).not.toHaveBeenCalled();
    });

    it('should handle recipeKeys array smaller than batchSize', async () => {
      // Arrange
      const mockKeys = ['recipe1', 'recipe2'];
      (ImageService.getImageFileName as jest.Mock).mockImplementation(
        (key) => `images/${key}.jpg`
      );
      (ImageService.getImageFromS3 as jest.Mock).mockResolvedValue('blob:mock');

      // Act
      const result = await ImageQueueService.fetchBatch(mockKeys, 5);

      // Assert
      expect(result.images).toHaveLength(2);
      expect(ImageService.getImageFromS3).toHaveBeenCalledTimes(2);
    });
  });

  describe('shouldRefillQueue', () => {
    it('should return true when queue length <= REFILL_THRESHOLD', () => {
      expect(ImageQueueService.shouldRefillQueue(8)).toBe(true);
      expect(ImageQueueService.shouldRefillQueue(5)).toBe(true);
      expect(ImageQueueService.shouldRefillQueue(0)).toBe(true);
    });

    it('should return false when queue length > REFILL_THRESHOLD', () => {
      expect(ImageQueueService.shouldRefillQueue(9)).toBe(false);
      expect(ImageQueueService.shouldRefillQueue(15)).toBe(false);
    });

    it('should handle edge case of 0 queue length', () => {
      expect(ImageQueueService.shouldRefillQueue(0)).toBe(true);
    });
  });

  describe('cleanupImages', () => {
    it('should call URL.revokeObjectURL for each image', () => {
      // Arrange
      const mockImages = [
        { filename: 'images/1.jpg', file: 'blob:mock1' },
        { filename: 'images/2.jpg', file: 'blob:mock2' },
      ];
      const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');

      // Act
      ImageQueueService.cleanupImages(mockImages);

      // Assert
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock1');
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock2');
      expect(revokeSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', () => {
      // Arrange
      const mockImages = [
        { filename: 'images/1.jpg', file: 'blob:mock1' },
      ];
      const revokeSpy = jest.spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {
          throw new Error('Revoke failed');
        });

      // Act & Assert - should not throw
      expect(() => {
        ImageQueueService.cleanupImages(mockImages);
      }).not.toThrow();

      expect(revokeSpy).toHaveBeenCalled();
    });

    it('should work with empty array', () => {
      // Arrange
      const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');

      // Act
      ImageQueueService.cleanupImages([]);

      // Assert
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it('should only revoke blob URLs, not other URL types', () => {
      // Arrange
      const mockImages = [
        { filename: 'images/1.jpg', file: 'blob:mock1' },
        { filename: 'images/2.jpg', file: 'https://example.com/image.jpg' },
        { filename: 'images/3.jpg', file: '' },
      ];
      const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');

      // Act
      ImageQueueService.cleanupImages(mockImages);

      // Assert
      expect(revokeSpy).toHaveBeenCalledTimes(1);
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock1');
    });
  });

  describe('createRecipeKeyPool', () => {
    it('should filter recipes by meal type', () => {
      // Arrange
      const mockJsonData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
        recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
      };
      const mockFilters: MealType[] = ['main dish', 'dessert'];
      (RecipeService.filterRecipesByMealType as jest.Mock).mockReturnValue(
        ['recipe1', 'recipe2']
      );
      (RecipeService.shuffleRecipeKeys as jest.Mock).mockReturnValue(
        ['recipe2', 'recipe1']
      );

      // Act
      const result = ImageQueueService.createRecipeKeyPool(mockJsonData, mockFilters);

      // Assert
      expect(RecipeService.filterRecipesByMealType).toHaveBeenCalledWith(
        mockJsonData,
        mockFilters
      );
      expect(RecipeService.shuffleRecipeKeys).toHaveBeenCalled();
      expect(result).toEqual(['recipe2', 'recipe1']);
    });

    it('should shuffle filtered recipe keys', () => {
      // Arrange
      const mockJsonData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
        recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
        recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'appetizer' },
      };
      const mockFilters: MealType[] = ['main dish'];
      (RecipeService.filterRecipesByMealType as jest.Mock).mockReturnValue(
        ['recipe1']
      );
      (RecipeService.shuffleRecipeKeys as jest.Mock).mockImplementation(
        (keys) => [...keys].reverse()
      );

      // Act
      const result = ImageQueueService.createRecipeKeyPool(mockJsonData, mockFilters);

      // Assert
      expect(RecipeService.shuffleRecipeKeys).toHaveBeenCalledWith(['recipe1']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return array of strings', () => {
      // Arrange
      const mockJsonData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
      };
      const mockFilters: MealType[] = [];
      (RecipeService.filterRecipesByMealType as jest.Mock).mockReturnValue(
        ['recipe1']
      );
      (RecipeService.shuffleRecipeKeys as jest.Mock).mockReturnValue(
        ['recipe1']
      );

      // Act
      const result = ImageQueueService.createRecipeKeyPool(mockJsonData, mockFilters);

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(typeof result[0]).toBe('string');
    });
  });
});
