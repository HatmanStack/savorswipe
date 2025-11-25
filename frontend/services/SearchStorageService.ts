import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecentSearch } from '@/types';

const RECENT_SEARCHES_KEY = '@recent_searches';
const MAX_RECENT_SEARCHES = 10;

export class SearchStorageService {
  /**
   * Load recent searches from AsyncStorage
   * @returns Array of recent searches, sorted by timestamp (most recent first)
   */
  static async getRecentSearches(): Promise<RecentSearch[]> {
    try {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);

      if (!data) {
        return [];
      }

      const searches = JSON.parse(data);

      // Validate structure
      if (!Array.isArray(searches)) {
        return [];
      }

      // Filter out invalid entries
      const validSearches = searches.filter(
        (s): s is RecentSearch =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.query === 'string' &&
          typeof s.timestamp === 'number'
      );

      // Sort by timestamp descending (most recent first)
      return validSearches.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {

      return [];
    }
  }

  /**
   * Add a new search to recent searches
   * @param query - Search query to save
   */
  static async addRecentSearch(query: string): Promise<void> {
    try {
      const trimmedQuery = query.trim();

      // Don't save empty queries
      if (trimmedQuery === '') {
        return;
      }

      // Load existing searches
      const existingSearches = await this.getRecentSearches();

      // Remove duplicate if query already exists
      const filteredSearches = existingSearches.filter(
        (search) => search.query !== trimmedQuery
      );

      // Add new search at the beginning
      const newSearch: RecentSearch = {
        query: trimmedQuery,
        timestamp: Date.now(),
      };

      const updatedSearches = [newSearch, ...filteredSearches];

      // Limit to MAX_RECENT_SEARCHES
      const limitedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);

      // Save to AsyncStorage
      await AsyncStorage.setItem(
        RECENT_SEARCHES_KEY,
        JSON.stringify(limitedSearches)
      );
    } catch (error) {

    }
  }

  /**
   * Clear all recent searches
   */
  static async clearRecentSearches(): Promise<void> {
    try {
      await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (error) {

    }
  }
}
