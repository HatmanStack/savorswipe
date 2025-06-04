import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Recipe, S3JsonData, ImageFile, MealType } from '@/types';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: Recipe | null;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  allFiles: string[];
  setAllFiles: (files: string[]) => void;
  jsonData: S3JsonData | null;
  setJsonData: (data: S3JsonData | null) => void;
  firstFile: ImageFile | null;
  setFirstFile: (file: ImageFile | null) => void;
  startImage: ImageFile | null; // TODO: Remove this when conditional rendering issue is fixed
  setStartImage: (file: ImageFile | null) => void; // TODO: Remove this when conditional rendering issue is fixed
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
  const [firstFile, setFirstFile] = useState<ImageFile | null>(null);
  const [jsonData, setJsonData] = useState<S3JsonData | null>(null);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [startImage, setStartImage] = useState<ImageFile | null>({ filename: '', file: '' }); // TODO: Remove when conditional rendering issue is fixed
  const [mealTypeFilters, setMealTypeFilters] = useState<MealType[]>(['main dish', 'dessert', 'appetizer', 'breakfast', 'side dish', 'beverage']);

  return (
    <RecipeContext.Provider value={{ currentRecipe, setCurrentRecipe, firstFile, setFirstFile, jsonData, setJsonData, 
    allFiles, setAllFiles, startImage, setStartImage, mealTypeFilters, setMealTypeFilters }}>
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