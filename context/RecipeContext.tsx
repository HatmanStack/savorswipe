import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: string | null; // Adjust type as needed
  setCurrentRecipe: (recipe: string | null) => void;
}

// Create the context
const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

// Create the provider component
export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRecipe, setCurrentRecipe] = useState<string | null>(null);

  return (
    <RecipeContext.Provider value={{ currentRecipe, setCurrentRecipe }}>
      {children}
    </RecipeContext.Provider>
  );
};

// Custom hook to use the RecipeContext
export const useRecipe = () => {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipe must be used within a RecipeProvider');
  }
  return context;
};