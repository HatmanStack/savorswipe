import { Recipe, S3JsonData } from '@/types';

export class SearchService {
  /**
   * Search recipes by title and ingredients
   * @param query - Search query string
   * @param jsonData - Recipe data from S3
   * @returns Array of matching recipes
   */
  static searchRecipes(query: string, jsonData: S3JsonData): Recipe[] {
    const trimmedQuery = query.trim();

    // Empty query returns no results (shows recent searches in UI)
    if (trimmedQuery === '') {
      return [];
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const results: Recipe[] = [];

    // Search through all recipes
    for (const key in jsonData) {
      const recipe = jsonData[key];

      if (
        this.matchesTitle(recipe, normalizedQuery) ||
        this.matchesIngredients(recipe, normalizedQuery)
      ) {
        results.push(recipe);
      }
    }

    return results;
  }

  /**
   * Check if recipe title matches query
   * @param recipe - Recipe to check
   * @param query - Normalized lowercase query
   * @returns True if title contains query
   */
  private static matchesTitle(recipe: Recipe, query: string): boolean {
    if (!recipe.Title) return false;
    return recipe.Title.toLowerCase().includes(query);
  }

  /**
   * Check if recipe ingredients match query
   * @param recipe - Recipe to check
   * @param query - Normalized lowercase query
   * @returns True if any ingredient contains query
   */
  private static matchesIngredients(recipe: Recipe, query: string): boolean {
    if (!recipe.Ingredients) return false;

    const ingredientsText = this.extractIngredientsText(recipe.Ingredients);
    return ingredientsText.toLowerCase().includes(query);
  }

  /**
   * Extract all text from ingredients (handles all formats)
   * @param ingredients - Ingredients in any format (string, array, object, nested)
   * @returns Concatenated text of all ingredients
   */
  private static extractIngredientsText(ingredients: string | string[] | Record<string, unknown> | null): string {
    if (typeof ingredients === 'string') {
      return ingredients;
    }

    if (Array.isArray(ingredients)) {
      return ingredients.join(' ');
    }

    if (typeof ingredients === 'object' && ingredients !== null) {
      // Handle both flat objects and nested objects
      let text = '';
      for (const key in ingredients) {
        const value = ingredients[key];

        // Add the key (ingredient name or section name)
        text += key + ' ';

        // Recursively extract value (handles nested objects)
        if (typeof value === 'string') {
          text += value + ' ';
        } else if (Array.isArray(value)) {
          text += value.join(' ') + ' ';
        } else if (typeof value === 'object' && value !== null) {
          text += this.extractIngredientsText(value) + ' ';
        }
      }
      return text;
    }

    return '';
  }
}
