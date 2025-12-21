import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import { Recipe, S3JsonData, MealType } from '@/types';
import { RecipeService } from '@/services/RecipeService';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: Recipe | null;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  jsonData: S3JsonData | null;
  setJsonData: React.Dispatch<React.SetStateAction<S3JsonData | null>>;
  mealTypeFilters: MealType[];
  setMealTypeFilters: (filters: MealType[]) => void;
  pendingRecipeForPicker: Recipe | null;
  setPendingRecipeForPicker: (recipe: Recipe | null) => void;
  refetchRecipes: () => Promise<void>;
}

// Create the context
const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

// Export MealType for backwards compatibility
export type { MealType };

// Create the provider component
export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRecipe, setCurrentRecipe] = useState<Recipe | null>(null);
  const [jsonData, setJsonData] = useState<S3JsonData | null>(null);
  const [mealTypeFilters, setMealTypeFilters] = useState<MealType[]>([
    'main dish',
    'dessert',
    'appetizer',
    'breakfast',
    'side dish',
    'beverage'
  ]);
  const [pendingRecipeForPicker, setPendingRecipeForPicker] = useState<Recipe | null>(null);

  // Fetch fresh data from Lambda (replaces local data entirely)
  const refetchRecipes = useCallback(async () => {
    try {
      const freshRecipes = await RecipeService.getRecipesFromS3();
      // Fresh data from S3 is the source of truth - replace entirely
      setJsonData(freshRecipes);
    } catch (error) {
      console.error('[RecipeContext] Error fetching recipes:', error);
      // Silent fallback: continue using existing data
    }
  }, []);

  // Load recipe JSON data with stale-while-revalidate pattern
  useEffect(() => {
    // Step 1: Load local cached recipes immediately (fast)
    const localRecipes = RecipeService.getLocalRecipes();
    if (Object.keys(localRecipes).length > 0) {
      setJsonData(localRecipes);
    }

    // Step 2: Fetch fresh data from Lambda in background (slow but fresh)
    refetchRecipes();
  }, []);

  // Memoize provider value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentRecipe,
    setCurrentRecipe,
    jsonData,
    setJsonData,
    mealTypeFilters,
    setMealTypeFilters,
    pendingRecipeForPicker,
    setPendingRecipeForPicker,
    refetchRecipes
  }), [currentRecipe, jsonData, mealTypeFilters, pendingRecipeForPicker, refetchRecipes]);

  return (
    <RecipeContext.Provider value={value}>
      {children}
    </RecipeContext.Provider>
  );
}

// Custom hook to use the RecipeContext
export const useRecipe = () => {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipe must be used within a RecipeProvider');
  }
  return context;
};