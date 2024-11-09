import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: string | null; // Adjust type as needed
  setCurrentRecipe: (recipe: string | null) => void;
  uploadSuccess: boolean; // Added uploadSuccess to the interface
  setUploadSuccess: (success: boolean) => void; // Added setUploadSuccess to the interface
  allFiles: string[]; // Added allFiles to the interface
  setAllFiles: (files: string[]) => void; // Added setAllFiles to the interface
}

// Create the context
const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

// Create the provider component
export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRecipe, setCurrentRecipe] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [allFiles, setAllFiles] = useState<string[]>([]);

  return (
    <RecipeContext.Provider value={{ currentRecipe, setCurrentRecipe, uploadSuccess, setUploadSuccess, allFiles, setAllFiles }}>
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