import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { Recipe, S3JsonData, MealType } from '@/types';
import { RecipeService } from '@/services/RecipeService';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: Recipe | null;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  jsonData: S3JsonData | null;
  setJsonData: (data: S3JsonData | null) => void;
  mealTypeFilters: MealType[];
  setMealTypeFilters: (filters: MealType[]) => void;
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

  // Load recipe JSON data with stale-while-revalidate pattern
  useEffect(() => {
    // Step 1: Load local cached recipes immediately (fast)
    const localRecipes = RecipeService.getLocalRecipes();
    if (Object.keys(localRecipes).length > 0) {
      setJsonData(localRecipes);
    }

    // Step 2: Fetch fresh data from Lambda in background (slow but fresh)
    const fetchFreshData = async () => {
      try {
        const freshRecipes = await RecipeService.getRecipesFromS3();

        // Merge strategy: append new recipes only (preserve existing in-memory data)
        setJsonData(prevData => {
          if (!prevData || Object.keys(prevData).length === 0) {
            // If no local data was loaded, use fresh data entirely
            return freshRecipes;
          }

          // Merge: keep existing recipes, add only new ones
          const merged = { ...prevData };
          Object.keys(freshRecipes).forEach(key => {
            if (!(key in prevData)) {
              // Only add recipes that don't exist locally
              merged[key] = freshRecipes[key];
            }
          });

          return merged;
        });
      } catch (error) {
        // Silent fallback: continue using local cached data
        if (__DEV__) {
          console.error('Failed to fetch fresh recipe data (using cached):', error);
        }
      }
    };

    fetchFreshData();
  }, []);

  // Memoize provider value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentRecipe,
    setCurrentRecipe,
    jsonData,
    setJsonData,
    mealTypeFilters,
    setMealTypeFilters
  }), [currentRecipe, jsonData, mealTypeFilters]);

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