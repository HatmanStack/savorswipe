import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the type for the context value
interface RecipeContextType {
  currentRecipe: string | null; // Adjust type as needed
  setCurrentRecipe: (recipe: string | null) => void;
  allFiles: string[]; // Added allFiles to the interface
  setAllFiles: (files: string[]) => void; // Added setAllFiles to the interface
  jsonData: Record<string, any> | null; // Added jsonData to the interface
  setJsonData: (data: Record<string, any> | null) => void; // Added setJsonData to the interface
  firstFile: { filename: string; file: string } | null; // Added firstFile to the interface
  setFirstFile: (file: { filename: string; file: string } | null) => void; // Added setFirstFile to the interface
  startImage: { filename: string; file: string } | null; // Weird Conditional Rendering Issue
  setStartImage: (file: { filename: string; file: string } | null) => void;  // Weird Conditional Rendering Issue
}

// Create the context
const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

// Create the provider component
export const RecipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRecipe, setCurrentRecipe] = useState<string | null>(null);
  const [firstFile, setFirstFile] = useState<{ filename: string, file: string } | null>(null);
  const [jsonData, setJsonData] = useState<Record<string, any> | null>(null);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [startImage, setStartImage] = useState<{ filename: '', file: '' } | null>({ filename: '', file: '' } ); // Weird Conditional Rendering Issue

  return (
    <RecipeContext.Provider value={{ currentRecipe, setCurrentRecipe, firstFile, setFirstFile, jsonData, setJsonData, allFiles, setAllFiles, startImage, setStartImage }}>
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