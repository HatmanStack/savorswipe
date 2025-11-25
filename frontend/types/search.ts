// Search-related type definitions
import { Recipe } from './index';

export type SearchQuery = string;

export interface SearchResult {
  recipe: Recipe;
  matchReason?: 'title' | 'ingredient';  // Optional, for future enhancement
}

export interface RecentSearch {
  query: string;
  timestamp: number;  // Unix timestamp
}

export interface SearchSuggestion {
  term: string;
  category: 'ingredient' | 'cuisine' | 'meal-type';
}
