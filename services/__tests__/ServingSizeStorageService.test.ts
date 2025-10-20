import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServingSizeStorageService } from '../ServingSizeStorageService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('ServingSizeStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferredServings', () => {
    it('should return stored serving size when available', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('6');

      const result = await ServingSizeStorageService.getPreferredServings();

      expect(result).toBe(6);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@savorswipe:preferred_servings');
    });

    it('should return default 4 when no value stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await ServingSizeStorageService.getPreferredServings();

      expect(result).toBe(4);
    });

    it('should return default 4 on storage error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await ServingSizeStorageService.getPreferredServings();

      expect(result).toBe(4);
    });

    it('should handle invalid stored values', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid');

      const result = await ServingSizeStorageService.getPreferredServings();

      expect(result).toBe(4);
    });
  });

  describe('setPreferredServings', () => {
    it('should store serving size', async () => {
      await ServingSizeStorageService.setPreferredServings(8);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@savorswipe:preferred_servings',
        '8'
      );
    });

    it('should handle storage errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(
        ServingSizeStorageService.setPreferredServings(6)
      ).resolves.toBeUndefined();
    });
  });
});
