import React, { ReactNode } from 'react';
import { RecipeProvider } from './RecipeContext';

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  return <RecipeProvider>{children}</RecipeProvider>;
};
