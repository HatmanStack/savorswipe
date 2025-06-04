import { Recipe, S3JsonData, UploadResponse, MealType } from '@/types';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

export class RecipeService {
  /**
   * Fetches the combined recipe data from S3/CloudFront
   */
  static async getRecipesFromS3(): Promise<S3JsonData> {
    const fileKey = 'jsondata/combined_data.json';
    const url = `${CLOUDFRONT_BASE_URL}/${fileKey}`;

    try {
      
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`HTTP error ${response.status} while fetching JSON: ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        throw new Error(`Failed to fetch JSON from CloudFront. Status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching JSON from CloudFront:', error);
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
}