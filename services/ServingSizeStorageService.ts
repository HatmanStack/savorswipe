import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@savorswipe:preferred_servings';
const DEFAULT_SERVINGS = 4;

export class ServingSizeStorageService {
  /**
   * Get the user's preferred serving size from storage.
   * Returns 4 (default) if no preference is stored or on error.
   */
  static async getPreferredServings(): Promise<number> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEY);

      if (value === null) {
        return DEFAULT_SERVINGS;
      }

      const parsed = parseInt(value, 10);

      if (isNaN(parsed) || parsed < 1) {
        return DEFAULT_SERVINGS;
      }

      return parsed;
    } catch (error) {
      console.error('Failed to get preferred servings:', error);
      return DEFAULT_SERVINGS;
    }
  }

  /**
   * Save the user's preferred serving size to storage.
   */
  static async setPreferredServings(servings: number): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, servings.toString());
    } catch (error) {
      console.error('Failed to set preferred servings:', error);
      // Fail silently - not critical if storage fails
    }
  }
}
