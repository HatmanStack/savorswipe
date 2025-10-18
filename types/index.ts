// Core Recipe Types
export interface Recipe {
  key: string;
  Title: string;
  Description?: string | string[];
  Ingredients?: RecipeIngredients;
  Directions?: RecipeDirections;
  Type?: MealType | MealType[];
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

export interface GetImagesProps {
  getNewList: boolean;
  fetchImage: boolean;
  setFetchImage: (data: boolean) => void;
  setImageDimensions: (data: ImageDimensions) => void;
}

// Context Types - will be split into focused contexts later
export interface RecipeDataContextType {
  recipes: S3JsonData | null;
  currentRecipe: Recipe | null;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  loadRecipes: () => Promise<void>;
}

export interface ImageContextType {
  currentImage: ImageFile | null;
  imageQueue: ImageFile[];
  allFiles: string[];
  setAllFiles: (files: string[]) => void;
  firstFile: ImageFile | null;
  setFirstFile: (file: ImageFile | null) => void;
  startImage: ImageFile | null;
  setStartImage: (file: ImageFile | null) => void;
  loadNextImage: () => void;
}

export interface FilterContextType {
  mealTypeFilters: MealType[];
  setMealTypeFilters: (filters: MealType[]) => void;
}

// Temporary interface to maintain backwards compatibility during refactor
export interface LegacyRecipeContextType {
  currentRecipe: string | null;
  setCurrentRecipe: (recipe: string | null) => void;
  allFiles: string[];
  setAllFiles: (files: string[]) => void;
  jsonData: Record<string, Recipe> | null;
  setJsonData: (data: Record<string, Recipe> | null) => void;
  firstFile: ImageFile | null;
  setFirstFile: (file: ImageFile | null) => void;
  startImage: ImageFile | null;
  setStartImage: (file: ImageFile | null) => void;
  mealTypeFilters: MealType[];
  setMealTypeFilters: (filters: MealType[]) => void;
}