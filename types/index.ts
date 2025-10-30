// Core Recipe Types
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
  Ingredients?: RecipeIngredients;
  Directions?: RecipeDirections;
  Type?: MealType | MealType[];
  /**
   * Number of servings this recipe makes in its original form.
   * Used as the baseline for ingredient scaling.
   * Defaults to 4 if not specified.
   */
  Servings?: number;
}

// Recipe Ingredients can be:
// - Simple string
// - Array of strings
// - Flat object with ingredient:amount pairs
// - Nested object with sections containing ingredient:amount pairs
export type RecipeIngredients = 
  | string 
  | string[] 
  | Record<string, string | string[]>
  | Record<string, Record<string, string>>;

// Recipe Directions can be:
// - Simple string
// - Array of strings  
// - Flat object with step:instruction pairs
// - Nested object with sections containing step:instruction pairs
export type RecipeDirections = 
  | string 
  | string[] 
  | Record<string, string | string[]>
  | Record<string, Record<string, string>>;

export type MealType = 'main dish' | 'dessert' | 'appetizer' | 'breakfast' | 'side dish' | 'beverage';

// Image and File Types
export interface ImageFile {
  filename: string;
  file: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// API Response Types
export interface UploadResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

export interface S3JsonData {
  [key: string]: Recipe;
}

// Component Props Types
export interface RecipeDetailsProps {
  currentRecipe: Recipe;
}


// Search types
export * from './search';