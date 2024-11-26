import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: string | null; // Adjust type as needed
  setCurrentRecipe: (recipe: string | null) => void;
  uploadMessage: string | null;// Added uploadMessage to the interface
  setUploadMessage: (message: string | null) => void; // Added setUploadMessage to the interface
  allFiles: string[]; // Added allFiles to the interface
  setAllFiles: (files: string[]) => void; // Added setAllFiles to the interface
  jsonData: Record<string, any> | null; // Added jsonData to the interface
  setJsonData: (data: Record<string, any> | null) => void; // Added setJsonData to the interface
}

// Create the context
const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

// Create the provider component
export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRecipe, setCurrentRecipe] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [jsonData, setJsonData] = useState<Record<string, any> | null>(null);
  const [allFiles, setAllFiles] = useState<string[]>([]);

  return (
    <RecipeContext.Provider value={{ currentRecipe, setCurrentRecipe, uploadMessage, setUploadMessage, jsonData, setJsonData, allFiles, setAllFiles }}>
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