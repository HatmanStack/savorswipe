// ============================================================================
// Branded Types for Type-Safe IDs
// ============================================================================

declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };

/**
 * Branded type utility - creates a nominal type from a structural type.
 * Prevents mixing up different string IDs (e.g., RecipeKey vs JobId).
 */
export type Branded<T, B> = T & Brand<B>;

/** Type-safe recipe key (prevents mixing with other string IDs) */
export type RecipeKey = Branded<string, 'RecipeKey'>;

/** Type-safe job ID (prevents mixing with recipe keys) */
export type JobId = Branded<string, 'JobId'>;

/** Helper to create a RecipeKey from a string */
export function asRecipeKey(key: string): RecipeKey {
  return key as RecipeKey;
}

/** Helper to create a JobId from a string */
export function asJobId(id: string): JobId {
  return id as JobId;
}

// ============================================================================
// Discriminated Union Types for Ingredients
// ============================================================================

/** Simple string ingredient (e.g., "2 cups flour") */
export interface SimpleIngredients {
  readonly kind: 'simple';
  readonly value: string;
}

/** Array of ingredient strings */
export interface ListIngredients {
  readonly kind: 'list';
  readonly items: readonly string[];
}

/** Flat object with ingredient:amount pairs */
export interface FlatIngredients {
  readonly kind: 'flat';
  readonly ingredients: Readonly<Record<string, string>>;
}

/** Nested object with sections containing ingredient:amount pairs */
export interface SectionedIngredients {
  readonly kind: 'sectioned';
  readonly sections: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Discriminated union for recipe ingredients.
 * Use the `kind` field for exhaustive pattern matching.
 */
export type RecipeIngredients =
  | SimpleIngredients
  | ListIngredients
  | FlatIngredients
  | SectionedIngredients;

// ============================================================================
// Discriminated Union Types for Directions
// ============================================================================

/** Simple string direction */
export interface SimpleDirections {
  readonly kind: 'simple';
  readonly value: string;
}

/** Array of direction steps */
export interface ListDirections {
  readonly kind: 'list';
  readonly steps: readonly string[];
}

/** Flat object with step number/name to instruction mapping */
export interface FlatDirections {
  readonly kind: 'flat';
  readonly steps: Readonly<Record<string, string>>;
}

/** Nested object with sections containing steps */
export interface SectionedDirections {
  readonly kind: 'sectioned';
  readonly sections: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Discriminated union for recipe directions.
 * Use the `kind` field for exhaustive pattern matching.
 */
export type RecipeDirections =
  | SimpleDirections
  | ListDirections
  | FlatDirections
  | SectionedDirections;

// ============================================================================
// Raw API Types (before normalization)
// ============================================================================

/**
 * Raw ingredient format from API (before normalization).
 * Can be any of the original formats without discriminant.
 */
export type RawIngredients =
  | string
  | string[]
  | Record<string, string | string[]>
  | Record<string, Record<string, string>>;

/**
 * Raw direction format from API (before normalization).
 * Can be any of the original formats without discriminant.
 */
export type RawDirections =
  | string
  | string[]
  | Record<string, string | string[]>
  | Record<string, Record<string, string>>;

/**
 * Raw recipe format from API (before normalization).
 * Ingredients and Directions are not yet discriminated.
 */
export interface RawRecipe {
  key?: string;
  uploadedAt?: string;
  Title: string;
  Description?: string | string[];
  Ingredients?: RawIngredients;
  Directions?: RawDirections;
  Type?: MealType | MealType[];
  Servings?: number;
  image_url?: string | null;
  image_search_results?: string[];
}

/** Raw API response before normalization */
export interface RawS3JsonData {
  [key: string]: RawRecipe;
}

// ============================================================================
// Core Recipe Types (Normalized)
// ============================================================================

export type MealType = 'main dish' | 'dessert' | 'appetizer' | 'breakfast' | 'side dish' | 'beverage';

/**
 * Recipe with flexible ingredient/direction types.
 *
 * Supports both:
 * - Raw API format (for backwards compatibility and tests)
 * - Normalized discriminated unions (for new type-safe code)
 *
 * Use normalizeRecipe() to convert raw data to discriminated format.
 */
export interface Recipe {
  key: string;
  /**
   * ISO 8601 timestamp of when this recipe was uploaded.
   * Used to display "new" indicator for recipes uploaded within the last 72 hours.
   * @example "2025-10-30T14:23:45.123Z"
   */
  uploadedAt?: string;
  Title: string;
  Description?: string | string[];
  /**
   * Ingredients in either raw or normalized format.
   * Use type guards (isSimpleIngredients, etc.) for type-safe access.
   */
  Ingredients?: RecipeIngredients | RawIngredients;
  /**
   * Directions in either raw or normalized format.
   * Use type guards (isSimpleDirections, etc.) for type-safe access.
   */
  Directions?: RecipeDirections | RawDirections;
  Type?: MealType | MealType[];
  /**
   * Number of servings this recipe makes in its original form.
   * Used as the baseline for ingredient scaling.
   * Defaults to 4 if not specified.
   */
  Servings?: number;
  /**
   * Google image URL selected for this recipe.
   * Stored for deduplication tracking to prevent same image on multiple recipes.
   * Used only as metadata, not for display (display uses recipe_key path).
   */
  image_url?: string | null;
  /**
   * Array of Google image search result URLs for image picker modal.
   * Contains 9 candidate images for user selection.
   * Populated when recipe pending image selection, cleared after selection.
   */
  image_search_results?: string[];
}

/**
 * Normalized recipe with guaranteed discriminated union types.
 * Use this when you need type-safe pattern matching.
 */
export interface NormalizedRecipe extends Omit<Recipe, 'Ingredients' | 'Directions'> {
  Ingredients?: RecipeIngredients;
  Directions?: RecipeDirections;
}

/** Normalized recipe data collection */
export interface S3JsonData {
  [key: string]: Recipe;
}

// ============================================================================
// Image and File Types
// ============================================================================

export interface ImageFile {
  filename: string;
  file: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface UploadResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface RecipeDetailsProps {
  currentRecipe: Recipe;
}

// ============================================================================
// Exhaustive Check Helper
// ============================================================================

/**
 * Helper for exhaustive switch statements.
 * If TypeScript shows an error on this function, you're missing a case.
 *
 * @example
 * switch (ingredients.kind) {
 *   case 'simple': return ...;
 *   case 'list': return ...;
 *   case 'flat': return ...;
 *   case 'sectioned': return ...;
 *   default: return assertNever(ingredients);
 * }
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

// ============================================================================
// Type Guards for Ingredients
// ============================================================================

/** Check if ingredients are in normalized format (has 'kind' field) */
export function isNormalizedIngredients(
  ing: RecipeIngredients | RawIngredients | undefined
): ing is RecipeIngredients {
  return ing !== undefined && typeof ing === 'object' && !Array.isArray(ing) && 'kind' in ing;
}

/** Check if ingredients are in raw string format */
export function isRawStringIngredients(
  ing: RecipeIngredients | RawIngredients | undefined
): ing is string {
  return typeof ing === 'string';
}

/** Check if ingredients are in raw array format */
export function isRawArrayIngredients(
  ing: RecipeIngredients | RawIngredients | undefined
): ing is string[] {
  return Array.isArray(ing);
}

// ============================================================================
// Type Guards for Directions
// ============================================================================

/** Check if directions are in normalized format (has 'kind' field) */
export function isNormalizedDirections(
  dir: RecipeDirections | RawDirections | undefined
): dir is RecipeDirections {
  return dir !== undefined && typeof dir === 'object' && !Array.isArray(dir) && 'kind' in dir;
}

/** Check if directions are in raw string format */
export function isRawStringDirections(
  dir: RecipeDirections | RawDirections | undefined
): dir is string {
  return typeof dir === 'string';
}

/** Check if directions are in raw array format */
export function isRawArrayDirections(
  dir: RecipeDirections | RawDirections | undefined
): dir is string[] {
  return Array.isArray(dir);
}

// Search types
export * from './search';
