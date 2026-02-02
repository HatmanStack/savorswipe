import {
  Recipe,
  S3JsonData,
  RecipeIngredients,
  RawIngredients,
  isNormalizedIngredients,
  isRawStringIngredients,
  isRawArrayIngredients,
  assertNever,
} from '@/types';

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
    for (const recipe of Object.values(jsonData)) {
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
   * Extract all text from ingredients.
   * Handles both raw and normalized formats.
   *
   * @param ingredients - Ingredients in any format
   * @returns Concatenated text of all ingredients
   */
  private static extractIngredientsText(
    ingredients: RecipeIngredients | RawIngredients
  ): string {
    // Handle normalized format with 'kind' discriminant
    if (isNormalizedIngredients(ingredients)) {
      return this.extractNormalizedIngredientsText(ingredients);
    }

    // Handle raw string format
    if (isRawStringIngredients(ingredients)) {
      return ingredients;
    }

    // Handle raw array format
    if (isRawArrayIngredients(ingredients)) {
      return ingredients.join(' ');
    }

    // Handle raw object format (flat or sectioned)
    if (typeof ingredients === 'object' && ingredients !== null) {
      return this.extractRawObjectIngredientsText(ingredients);
    }

    return '';
  }

  /**
   * Extract text from normalized ingredients using exhaustive pattern matching.
   */
  private static extractNormalizedIngredientsText(ingredients: RecipeIngredients): string {
    switch (ingredients.kind) {
      case 'simple':
        return ingredients.value;

      case 'list':
        return ingredients.items.join(' ');

      case 'flat':
        return Object.entries(ingredients.ingredients)
          .map(([name, amount]) => `${name} ${amount}`)
          .join(' ');

      case 'sectioned':
        return Object.entries(ingredients.sections)
          .flatMap(([section, items]) => [
            section,
            ...Object.entries(items).map(([name, amount]) => `${name} ${amount}`),
          ])
          .join(' ');

      default:
        return assertNever(ingredients);
    }
  }

  /**
   * Extract text from raw object format (backwards compatibility).
   * Handles both flat { "ing": "amount" } and sectioned { "Section": { "ing": "amount" } }
   */
  private static extractRawObjectIngredientsText(
    ingredients: Record<string, string | string[] | Record<string, string>>
  ): string {
    let text = '';
    for (const [key, value] of Object.entries(ingredients)) {
      text += key + ' ';

      if (typeof value === 'string') {
        text += value + ' ';
      } else if (Array.isArray(value)) {
        text += value.join(' ') + ' ';
      } else if (typeof value === 'object' && value !== null) {
        // Nested object (sectioned format)
        for (const [innerKey, innerValue] of Object.entries(value)) {
          text += `${innerKey} ${innerValue} `;
        }
      }
    }
    return text.trim();
  }
}
