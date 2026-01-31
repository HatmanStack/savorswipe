import type { Recipe, RecipeIngredients, RecipeDirections } from '@/types';

const SITE_URL = 'https://savorswipe.hatstack.fun';
const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

/**
 * Extracts ingredients as a flat string array for JSON-LD
 */
export function getIngredientsList(ingredients: RecipeIngredients | undefined): string[] {
  if (!ingredients) return [];
  if (typeof ingredients === 'string') return [ingredients];
  if (Array.isArray(ingredients)) return ingredients;

  const result: string[] = [];
  for (const [key, value] of Object.entries(ingredients)) {
    if (typeof value === 'string') {
      result.push(value ? `${value} ${key}` : key);
    } else if (Array.isArray(value)) {
      result.push(...value);
    } else if (typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value)) {
        result.push(subValue ? `${subValue} ${subKey}` : subKey);
      }
    }
  }
  return result;
}

/**
 * Extracts directions as a flat string array for JSON-LD
 */
export function getInstructionsList(directions: RecipeDirections | undefined): string[] {
  if (!directions) return [];
  if (typeof directions === 'string') return [directions];
  if (Array.isArray(directions)) return directions;

  const result: string[] = [];
  for (const value of Object.values(directions)) {
    if (typeof value === 'string') {
      result.push(value);
    } else if (Array.isArray(value)) {
      result.push(...value);
    } else if (typeof value === 'object') {
      for (const subValue of Object.values(value)) {
        result.push(subValue as string);
      }
    }
  }
  return result;
}

/**
 * Extracts recipe description as a string
 */
export function getRecipeDescription(recipe: Recipe): string {
  if (recipe.Description) {
    return Array.isArray(recipe.Description)
      ? recipe.Description.join(' ')
      : recipe.Description;
  }
  return `${recipe.Title} recipe - discover and cook with SavorSwipe`;
}

/**
 * Gets the CloudFront image URL for a recipe
 */
export function getRecipeImageUrl(recipeKey: string): string {
  if (CLOUDFRONT_BASE_URL) {
    return `${CLOUDFRONT_BASE_URL}/images/${recipeKey}.jpg`;
  }
  return `${SITE_URL}/og-image.jpg`;
}

/**
 * Generates Recipe JSON-LD structured data
 */
export function generateRecipeJsonLd(recipe: Recipe): object {
  const ingredients = getIngredientsList(recipe.Ingredients);
  const instructions = getInstructionsList(recipe.Directions);
  const imageUrl = getRecipeImageUrl(recipe.key);

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.Title,
    description: getRecipeDescription(recipe),
    image: imageUrl,
    recipeYield: recipe.Servings ? `${recipe.Servings} servings` : undefined,
    recipeIngredient: ingredients.length > 0 ? ingredients : undefined,
    recipeInstructions: instructions.length > 0
      ? instructions.map((step, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          text: step,
        }))
      : undefined,
  };
}

/**
 * Generates the canonical URL for a recipe
 */
export function getRecipeUrl(recipeKey: string): string {
  return `${SITE_URL}/recipe/${recipeKey}`;
}
