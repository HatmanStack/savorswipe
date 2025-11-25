import { Recipe, S3JsonData, UploadResponse, MealType } from '@/types';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

/**
 * Normalizes a URL by removing trailing slashes
 * Prevents double-slash issues when constructing endpoints
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export class RecipeService {
  /**
   * Loads the bundled local recipe data from assets
   * Used for fast initial load (stale-while-revalidate pattern)
   */
  static getLocalRecipes(): S3JsonData {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localData = require('@/assets/starter_data/combined_data.json');
      return localData as S3JsonData;
    } catch (error) {

      // Return empty object as fallback
      return {};
    }
  }

  /**
   * Fetches the combined recipe data from Lambda (which fetches from S3)
   * This bypasses CloudFront cache to ensure fresh data
   */
  static async getRecipesFromS3(): Promise<S3JsonData> {
    const rawApiUrl = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

    if (!rawApiUrl) {
      throw new Error('EXPO_PUBLIC_API_GATEWAY_URL environment variable not set');
    }

    const apiUrl = normalizeUrl(rawApiUrl);

    try {
      const response = await fetch(`${apiUrl}/recipes`, {
        method: 'GET',
      });

      if (!response.ok) {

        const errorText = await response.text();

        throw new Error(`Failed to fetch JSON from API. Status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {

      throw error;
    }
  }

  /**
   * Fetches a recipe by its key/ID
   */
  static async getRecipeById(recipeId: string, allRecipes?: S3JsonData): Promise<Recipe | null> {
    // If allRecipes is provided, use it and don't fetch from S3
    if (allRecipes) {
      if (allRecipes[recipeId]) {
        return { ...allRecipes[recipeId], key: recipeId };
      }
      return null;
    }

    // Otherwise fetch from S3
    try {
      const recipes = await this.getRecipesFromS3();
      if (recipes[recipeId]) {
        return { ...recipes[recipeId], key: recipeId };
      }
      return null;
    } catch (error) {

      throw error;
    }
  }

  /**
   * Filters recipes by meal type
   */
  static filterRecipesByMealType(recipes: S3JsonData, filters: MealType[]): string[] {
    if (filters.length === 0) {
      return Object.keys(recipes);
    }

    return Object.keys(recipes).filter(key => {
      const recipe = recipes[key];
      if (!recipe?.Type) return false;

      return Array.isArray(recipe.Type)
        ? recipe.Type.some(type => filters.includes(type))
        : filters.includes(recipe.Type);
    });
  }

  /**
   * Shuffles an array of recipe keys
   */
  static shuffleRecipeKeys(keys: string[]): string[] {
    return [...keys].sort(() => Math.random() - 0.5);
  }

  /**
   * Gets random recipe keys for initial loading
   */
  static getRandomRecipeKeys(recipes: S3JsonData, count: number = 3): string[] {
    const allKeys = Object.keys(recipes);
    const shuffled = this.shuffleRecipeKeys(allKeys);
    return shuffled.slice(0, count);
  }

  /**
   * Uploads a recipe image for OCR processing
   */
  static async uploadRecipe(base64Image: string): Promise<UploadResponse> {
    const uploadUrl = process.env.EXPO_PUBLIC_UPLOAD_URL;

    if (!uploadUrl) {
      throw new Error('Upload URL not configured');
    }

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
        }),
      });

      const result = await response.json();

      return {
        statusCode: response.status,
        body: JSON.stringify(result),
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {

      throw error;
    }
  }

  /**
   * Selects an image for a recipe with pending image selection
   * Calls the backend endpoint to fetch the image from Google and store it in S3
   * @param recipeKey - The recipe key
   * @param imageUrl - The Google image URL to select
   * @returns Updated recipe object with image_url set
   * @throws Error if network request fails or recipe not found
   */
  static async selectRecipeImage(recipeKey: string, imageUrl: string): Promise<Recipe> {
    const rawApiUrl = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

    if (!rawApiUrl) {
      throw new Error('EXPO_PUBLIC_API_GATEWAY_URL environment variable not set');
    }

    const apiUrl = normalizeUrl(rawApiUrl);
    const endpoint = `${apiUrl}/recipe/${recipeKey}/image`;

    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const response = await Promise.race([
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrl }),
        }),
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Request timeout')), 30000);
        }),
      ]);

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 404) {
          throw new Error('Recipe not found');
        }
        if (response.status === 400) {
          throw new Error('Invalid image URL');
        }
        throw new Error(`Failed to select image. Status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        const errorMessage = result.error || 'Failed to select image';

        throw new Error(errorMessage);
      }

      // Return recipe with key attached
      return { ...result.recipe, key: recipeKey };
    } finally {
      // Always clear timeout to prevent handle leaks
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Deletes a recipe from the database
   * Removes the recipe from combined_data.json and recipe_embeddings.json
   * @param recipeKey - The recipe key to delete
   * @returns true if deletion was successful
   * @throws Error if network request fails or recipe not found
   */
  static async deleteRecipe(recipeKey: string): Promise<boolean> {
    const rawApiUrl = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

    if (!rawApiUrl) {
      throw new Error('EXPO_PUBLIC_API_GATEWAY_URL environment variable not set');
    }

    const apiUrl = normalizeUrl(rawApiUrl);
    const endpoint = `${apiUrl}/recipe/${recipeKey}`;

    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const response = await Promise.race([
        fetch(endpoint, {
          method: 'DELETE',
        }),
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Request timeout')), 30000);
        }),
      ]);

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 404) {
          throw new Error('Recipe not found');
        }
        throw new Error(`Failed to delete recipe. Status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        const errorMessage = result.error || 'Failed to delete recipe';

        throw new Error(errorMessage);
      }

      return true;
    } finally {
      // Always clear timeout to prevent handle leaks
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Determines if a recipe is "new" (uploaded within last 72 hours)
 * @param recipe - Recipe object with optional uploadedAt timestamp
 * @returns True if recipe was uploaded within 72 hours, false otherwise
 */
export function isNewRecipe(recipe: Recipe): boolean {
  // Return false if no uploadedAt field
  if (!recipe.uploadedAt) {
    return false;
  }

  try {
    // Parse ISO 8601 timestamp
    const uploadTime = new Date(recipe.uploadedAt).getTime();

    // Check for invalid date (NaN)
    if (isNaN(uploadTime)) {
      return false;
    }

    const currentTime = Date.now();

    // Handle future timestamps (with 1-minute tolerance for clock skew)
    const ONE_MINUTE_MS = 60 * 1000;
    if (uploadTime > currentTime + ONE_MINUTE_MS) {
      return false;
    }

    // Calculate hours elapsed
    const msElapsed = currentTime - uploadTime;
    const hoursElapsed = msElapsed / (1000 * 60 * 60);

    // Return true if within 72 hours (exactly 72 hours returns false)
    return hoursElapsed < 72;
  } catch (error) {
    // Invalid timestamp format
    return false;
  }
}
