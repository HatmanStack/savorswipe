import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchStorageService } from '../SearchStorageService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('SearchStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentSearches', () => {
    it('should return empty array when no searches stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await SearchStorageService.getRecentSearches();

      expect(result).toEqual([]);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@recent_searches');
    });

    it('should return parsed searches sorted by timestamp', async () => {
      const mockSearches = [
        { query: 'chicken', timestamp: 1000 },
        { query: 'pasta', timestamp: 2000 },
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockSearches));

      const result = await SearchStorageService.getRecentSearches();

      expect(result).toEqual([
        { query: 'pasta', timestamp: 2000 },
        { query: 'chicken', timestamp: 1000 },
      ]);
    });

    it('should handle JSON parse errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json');

      const result = await SearchStorageService.getRecentSearches();

      expect(result).toEqual([]);
    });
  });

  describe('addRecentSearch', () => {
    it('should add new search with timestamp', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await SearchStorageService.addRecentSearch('chocolate');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
      const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].query).toBe('chocolate');
      expect(savedData[0].timestamp).toBeDefined();
    });

    it('should not save empty or whitespace queries', async () => {
      await SearchStorageService.addRecentSearch('  ');

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should limit to 10 most recent searches', async () => {
      const existingSearches = Array.from({ length: 10 }, (_, i) => ({
        query: `search${i}`,
        timestamp: i,
      }));
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(existingSearches));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await SearchStorageService.addRecentSearch('new search');

      const savedData = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(10);
      expect(savedData[0].query).toBe('new search');
    });
  });

  describe('clearRecentSearches', () => {
    it('should remove all recent searches', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await SearchStorageService.clearRecentSearches();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@recent_searches');
    });
  });
});
