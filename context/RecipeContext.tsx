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

  // Load recipe JSON data from S3 on mount
  useEffect(() => {
    const loadRecipeData = async () => {
      try {
        const combinedJsonData = await RecipeService.getRecipesFromS3();
        setJsonData(combinedJsonData);
      } catch (error) {
        if (__DEV__) {
          console.error('Failed to fetch recipe data:', error);
        }
      }
    };

    loadRecipeData();
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