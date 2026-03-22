import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { RecipeProvider, useRecipe } from '@/context/RecipeContext';
import { S3JsonData, Recipe, MealType } from '@/types';

// Mock RecipeService
jest.mock('@/services/RecipeService', () => ({
  RecipeService: {
    getLocalRecipes: jest.fn(),
    getRecipesFromS3: jest.fn(),
  },
}));

// Import after mock to get mocked version
import { RecipeService } from '@/services/RecipeService';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecipeProvider>{children}</RecipeProvider>
);

describe('RecipeContext', () => {
  const mockLocalRecipes: S3JsonData = {
    '1': { key: '1', Title: 'Local Recipe 1', Type: 'main dish' },
    '2': { key: '2', Title: 'Local Recipe 2', Type: 'dessert' },
  };

  const mockFreshRecipes: S3JsonData = {
    '1': { key: '1', Title: 'Fresh Recipe 1', Type: 'main dish' },
    '2': { key: '2', Title: 'Fresh Recipe 2', Type: 'dessert' },
    '3': { key: '3', Title: 'Fresh Recipe 3', Type: 'appetizer' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (RecipeService.getLocalRecipes as jest.Mock).mockReturnValue({});
    (RecipeService.getRecipesFromS3 as jest.Mock).mockResolvedValue({});
  });

  it('has correct initial state', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    expect(result.current.currentRecipe).toBeNull();
    expect(result.current.pendingRecipeForPicker).toBeNull();
    // All meal type filters should be selected initially
    expect(result.current.mealTypeFilters).toEqual([
      'main dish',
      'dessert',
      'appetizer',
      'breakfast',
      'side dish',
      'beverage',
    ]);
  });

  it('setCurrentRecipe updates currentRecipe state', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    const recipe: Recipe = { key: '1', Title: 'Test Recipe' };

    act(() => {
      result.current.setCurrentRecipe(recipe);
    });

    expect(result.current.currentRecipe).toEqual(recipe);
  });

  it('setJsonData updates jsonData state', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    const data: S3JsonData = {
      '1': { key: '1', Title: 'Recipe 1' },
    };

    act(() => {
      result.current.setJsonData(data);
    });

    expect(result.current.jsonData).toEqual(data);
  });

  it('setMealTypeFilters updates filter state', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    const newFilters: MealType[] = ['main dish', 'dessert'];

    act(() => {
      result.current.setMealTypeFilters(newFilters);
    });

    expect(result.current.mealTypeFilters).toEqual(newFilters);
  });

  it('enqueuePendingRecipe and dequeuePendingRecipe manage queue', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    const recipe1: Recipe = {
      key: 'pending1',
      Title: 'Pending Recipe 1',
      image_search_results: ['https://example.com/img.jpg'],
      image_url: null,
    };

    const recipe2: Recipe = {
      key: 'pending2',
      Title: 'Pending Recipe 2',
      image_search_results: ['https://example.com/img2.jpg'],
      image_url: null,
    };

    // Enqueue first recipe
    act(() => {
      result.current.enqueuePendingRecipe(recipe1);
    });
    expect(result.current.pendingRecipeForPicker).toEqual(recipe1);
    expect(result.current.pendingRecipesForPicker).toHaveLength(1);

    // Enqueue second recipe
    act(() => {
      result.current.enqueuePendingRecipe(recipe2);
    });
    expect(result.current.pendingRecipeForPicker).toEqual(recipe1);
    expect(result.current.pendingRecipesForPicker).toHaveLength(2);

    // Dequeue first - second becomes head
    act(() => {
      result.current.dequeuePendingRecipe();
    });
    expect(result.current.pendingRecipeForPicker).toEqual(recipe2);
    expect(result.current.pendingRecipesForPicker).toHaveLength(1);

    // Dequeue second - queue empty
    act(() => {
      result.current.dequeuePendingRecipe();
    });
    expect(result.current.pendingRecipeForPicker).toBeNull();
    expect(result.current.pendingRecipesForPicker).toHaveLength(0);
  });

  it('enqueuePendingRecipe prevents duplicate keys', () => {
    const { result } = renderHook(() => useRecipe(), { wrapper });

    const recipe: Recipe = {
      key: 'pending1',
      Title: 'Pending Recipe',
      image_search_results: ['https://example.com/img.jpg'],
      image_url: null,
    };

    act(() => {
      result.current.enqueuePendingRecipe(recipe);
      result.current.enqueuePendingRecipe(recipe);
    });

    expect(result.current.pendingRecipesForPicker).toHaveLength(1);
  });

  it('stale-while-revalidate: loads local data first, then fresh data replaces it', async () => {
    (RecipeService.getLocalRecipes as jest.Mock).mockReturnValue(mockLocalRecipes);
    (RecipeService.getRecipesFromS3 as jest.Mock).mockResolvedValue(mockFreshRecipes);

    const { result } = renderHook(() => useRecipe(), { wrapper });

    // Local data should load first (synchronous stale-while-revalidate)
    await waitFor(() => {
      expect(result.current.jsonData).toEqual(mockLocalRecipes);
    }, { timeout: 3000 });

    // Eventually fresh data should replace it
    await waitFor(() => {
      expect(result.current.jsonData).toEqual(mockFreshRecipes);
    }, { timeout: 3000 });

    expect(RecipeService.getLocalRecipes).toHaveBeenCalledTimes(1);
    expect(RecipeService.getRecipesFromS3).toHaveBeenCalledTimes(1);
  });

  it('useRecipe throws an error when used outside RecipeProvider', () => {
    // Suppress console.error for this test since React will log the error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useRecipe());
    }).toThrow('useRecipe must be used within a RecipeProvider');

    consoleSpy.mockRestore();
  });
});
