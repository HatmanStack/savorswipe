import { Recipe, S3JsonData, UploadResponse, MealType } from '@/types';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

export class RecipeService {
  /**
   * Loads the bundled local recipe data from assets
   * Used for fast initial load (stale-while-revalidate pattern)
   */
  static getLocalRecipes(): S3JsonData {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localData = require('@/assets/data/combined_data.json');
      return localData as S3JsonData;
    } catch (error) {
      console.error('Error loading local recipes:', error);
      // Return empty object as fallback
      return {};
    }
  }

  /**
   * Fetches the combined recipe data from Lambda (which fetches from S3)
   * This bypasses CloudFront cache to ensure fresh data
   */
  static async getRecipesFromS3(): Promise<S3JsonData> {
    const lambdaUrl = process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;

    if (!lambdaUrl) {
      throw new Error('EXPO_PUBLIC_LAMBDA_FUNCTION_URL environment variable not set');
    }

    try {
      const response = await fetch(lambdaUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        console.error(`HTTP error ${response.status} while fetching JSON: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        throw new Error(`Failed to fetch JSON from Lambda. Status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching JSON from Lambda:', error);
      throw error;
    }
  }

  /**
   * Fetches a recipe by its key/ID
   */
  static async getRecipeById(recipeId: string, allRecipes?: S3JsonData): Promise<Recipe | null> {
    if (allRecipes && allRecipes[recipeId]) {
      return { ...allRecipes[recipeId], key: recipeId };
    }

    try {
      const recipes = await this.getRecipesFromS3();
      if (recipes[recipeId]) {
        return { ...recipes[recipeId], key: recipeId };
      }
      return null;
    } catch (error) {
      console.error('Error fetching recipe by ID:', error);
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
      console.error('Error uploading recipe:', error);
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
    const lambdaUrl = process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;

    if (!lambdaUrl) {
      throw new Error('EXPO_PUBLIC_LAMBDA_FUNCTION_URL environment variable not set');
    }

    const endpoint = `${lambdaUrl}/recipe/${recipeKey}/image`;

    try {
      console.log(`[RecipeService] Selecting image for recipe: ${recipeKey}`);

      const response = await Promise.race([
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrl }),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        ),
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RecipeService] Image selection failed with status ${response.status}:`, errorText);

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
        console.error('[RecipeService] Image selection error:', errorMessage);
        throw new Error(errorMessage);
      }

      console.log(`[RecipeService] Image selected successfully for recipe: ${recipeKey}`);

      // Return recipe with key attached
      return { ...result.recipe, key: recipeKey };
    } catch (error) {
      console.error('[RecipeService] Error selecting recipe image:', error);
      throw error;
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
    const lambdaUrl = process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;

    if (!lambdaUrl) {
      throw new Error('EXPO_PUBLIC_LAMBDA_FUNCTION_URL environment variable not set');
    }

    const endpoint = `${lambdaUrl}/recipe/${recipeKey}`;

    try {
      console.log(`[RecipeService] Deleting recipe: ${recipeKey}`);

      const response = await Promise.race([
        fetch(endpoint, {
          method: 'DELETE',
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        ),
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RecipeService] Recipe deletion failed with status ${response.status}:`, errorText);

        if (response.status === 404) {
          throw new Error('Recipe not found');
        }
        throw new Error(`Failed to delete recipe. Status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        const errorMessage = result.error || 'Failed to delete recipe';
        console.error('[RecipeService] Recipe deletion error:', errorMessage);
        throw new Error(errorMessage);
      }

      console.log(`[RecipeService] Recipe deleted successfully: ${recipeKey}`);
      return true;
    } catch (error) {
      console.error('[RecipeService] Error deleting recipe:', error);
      throw error;
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