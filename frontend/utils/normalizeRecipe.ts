/**
 * Recipe Normalization Utility
 *
 * Transforms raw API data (without discriminant fields) into normalized
 * discriminated union types for type-safe pattern matching.
 */

import {
  Recipe,
  RecipeIngredients,
  RecipeDirections,
  RawRecipe,
  RawIngredients,
  RawDirections,
  RawS3JsonData,
  S3JsonData,
  SimpleIngredients,
  ListIngredients,
  FlatIngredients,
  SectionedIngredients,
  SimpleDirections,
  ListDirections,
  FlatDirections,
  SectionedDirections,
} from '@/types';

/**
 * Check if a value is a plain object (not array, not null).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if an object has nested objects as values (sectioned format).
 * Sectioned format: { "Section Name": { "ingredient": "amount" } }
 */
function isSectionedObject(obj: Record<string, unknown>): boolean {
  const values = Object.values(obj);
  if (values.length === 0) return false;

  // Check if ALL values are plain objects (not strings, not arrays)
  return values.every(
    (v) => isPlainObject(v) && !Array.isArray(v) && typeof v !== 'string'
  );
}

/**
 * Normalize raw ingredients from API to discriminated union type.
 *
 * Handles all formats:
 * - string -> SimpleIngredients
 * - string[] -> ListIngredients
 * - Record<string, string> -> FlatIngredients
 * - Record<string, Record<string, string>> -> SectionedIngredients
 */
export function normalizeIngredients(raw: RawIngredients | undefined): RecipeIngredients | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  // Simple string format
  if (typeof raw === 'string') {
    return { kind: 'simple', value: raw } satisfies SimpleIngredients;
  }

  // Array format
  if (Array.isArray(raw)) {
    return { kind: 'list', items: raw } satisfies ListIngredients;
  }

  // Object format - determine if flat or sectioned
  if (isPlainObject(raw)) {
    if (isSectionedObject(raw)) {
      // Sectioned format: { "Section": { "ing": "amount" } }
      const sections: Record<string, Record<string, string>> = {};
      for (const [section, items] of Object.entries(raw)) {
        if (isPlainObject(items)) {
          sections[section] = items as Record<string, string>;
        }
      }
      return { kind: 'sectioned', sections } satisfies SectionedIngredients;
    } else {
      // Flat format: { "ingredient": "amount" } or { "ingredient": ["step1", "step2"] }
      // Flatten any array values to strings
      const ingredients: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
          ingredients[key] = value;
        } else if (Array.isArray(value)) {
          ingredients[key] = value.join(', ');
        }
      }
      return { kind: 'flat', ingredients } satisfies FlatIngredients;
    }
  }

  // Fallback: treat as simple string
  return { kind: 'simple', value: String(raw) } satisfies SimpleIngredients;
}

/**
 * Normalize raw directions from API to discriminated union type.
 *
 * Handles all formats:
 * - string -> SimpleDirections
 * - string[] -> ListDirections
 * - Record<string, string> -> FlatDirections
 * - Record<string, Record<string, string>> -> SectionedDirections
 */
export function normalizeDirections(raw: RawDirections | undefined): RecipeDirections | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  // Simple string format
  if (typeof raw === 'string') {
    return { kind: 'simple', value: raw } satisfies SimpleDirections;
  }

  // Array format
  if (Array.isArray(raw)) {
    return { kind: 'list', steps: raw } satisfies ListDirections;
  }

  // Object format - determine if flat or sectioned
  if (isPlainObject(raw)) {
    if (isSectionedObject(raw)) {
      // Sectioned format: { "Section": { "step1": "instruction" } }
      const sections: Record<string, Record<string, string>> = {};
      for (const [section, items] of Object.entries(raw)) {
        if (isPlainObject(items)) {
          sections[section] = items as Record<string, string>;
        }
      }
      return { kind: 'sectioned', sections } satisfies SectionedDirections;
    } else {
      // Flat format: { "1": "instruction" }
      const steps: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
          steps[key] = value;
        } else if (Array.isArray(value)) {
          steps[key] = value.join(' ');
        }
      }
      return { kind: 'flat', steps } satisfies FlatDirections;
    }
  }

  // Fallback: treat as simple string
  return { kind: 'simple', value: String(raw) } satisfies SimpleDirections;
}

/**
 * Normalize a raw recipe from API to fully-typed Recipe.
 *
 * @param raw - Raw recipe from API response
 * @param key - Recipe key (from object key in S3JsonData)
 * @returns Normalized Recipe with discriminated union types
 */
export function normalizeRecipe(raw: RawRecipe, key: string): Recipe {
  return {
    ...raw,
    key,
    Ingredients: normalizeIngredients(raw.Ingredients),
    Directions: normalizeDirections(raw.Directions),
  };
}

/**
 * Normalize entire S3JsonData response from API.
 *
 * Call this on API responses before storing in context/state.
 *
 * @param rawData - Raw API response
 * @returns Normalized S3JsonData with all recipes normalized
 */
export function normalizeS3JsonData(rawData: RawS3JsonData): S3JsonData {
  const normalized: S3JsonData = {};

  for (const [key, rawRecipe] of Object.entries(rawData)) {
    normalized[key] = normalizeRecipe(rawRecipe, key);
  }

  return normalized;
}
