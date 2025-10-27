import { RecipeService } from '../RecipeService';
import type { S3JsonData } from '@/types';

// Mock environment variables
const MOCK_LAMBDA_URL = 'https://test-lambda.execute-api.us-east-1.amazonaws.com';

describe('RecipeService', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = jest.fn();

    // Use Object.defineProperty for env vars to ensure it persists
    Object.defineProperty(process.env, 'EXPO_PUBLIC_LAMBDA_FUNCTION_URL', {
      value: MOCK_LAMBDA_URL,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;
  });

  describe('getRecipesFromS3', () => {
    it('should fetch recipes from Lambda URL', async () => {
      // Arrange
      const mockRecipes: S3JsonData = {
        'recipe-1': {
          key: 'recipe-1',
          Title: 'Test Recipe',
          Servings: 4,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockRecipes,
      });

      // Act
      const result = await RecipeService.getRecipesFromS3();

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        MOCK_LAMBDA_URL,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(result).toEqual(mockRecipes);
    });

    it('should throw error when LAMBDA_FUNCTION_URL not set', async () => {
      // Arrange
      delete process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL;

      // Act & Assert
      await expect(RecipeService.getRecipesFromS3()).rejects.toThrow(
        'EXPO_PUBLIC_LAMBDA_FUNCTION_URL environment variable not set'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should throw error on HTTP error response', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error details',
      });

      // Act & Assert
      await expect(RecipeService.getRecipesFromS3()).rejects.toThrow(
        'Failed to fetch JSON from Lambda. Status: 500'
      );
    });

    it('should throw error on network failure', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(RecipeService.getRecipesFromS3()).rejects.toThrow('Network error');
    });

    it('should handle empty recipe data', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      // Act
      const result = await RecipeService.getRecipesFromS3();

      // Assert
      expect(result).toEqual({});
    });

    it('should parse JSON response correctly', async () => {
      // Arrange
      const mockRecipes: S3JsonData = {
        'recipe-1': {
          key: 'recipe-1',
          Title: 'Recipe 1',
          Servings: 6,
          Ingredients: { 'Flour': '2 cups' },
        },
        'recipe-2': {
          key: 'recipe-2',
          Title: 'Recipe 2',
          Type: 'dessert',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockRecipes,
      });

      // Act
      const result = await RecipeService.getRecipesFromS3();

      // Assert
      expect(result).toHaveProperty('recipe-1');
      expect(result).toHaveProperty('recipe-2');
      expect(result['recipe-1'].Title).toBe('Recipe 1');
      expect(result['recipe-2'].Type).toBe('dessert');
    });
  });

  describe('getRecipeById', () => {
    it('should return recipe from provided data', async () => {
      // Arrange
      const allRecipes: S3JsonData = {
        'recipe-123': {
          key: 'recipe-123',
          Title: 'Test Recipe',
          Servings: 4,
        },
      };

      // Act
      const result = await RecipeService.getRecipeById('recipe-123', allRecipes);

      // Assert
      expect(result).toEqual({
        key: 'recipe-123',
        Title: 'Test Recipe',
        Servings: 4,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch recipes if not provided', async () => {
      // Arrange
      const mockRecipes: S3JsonData = {
        'recipe-456': {
          key: 'recipe-456',
          Title: 'Fetched Recipe',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockRecipes,
      });

      // Act
      const result = await RecipeService.getRecipeById('recipe-456');

      // Assert
      expect(global.fetch).toHaveBeenCalled();
      expect(result).toEqual({
        key: 'recipe-456',
        Title: 'Fetched Recipe',
      });
    });

    it('should return null if recipe not found', async () => {
      // Arrange
      const allRecipes: S3JsonData = {
        'recipe-123': {
          key: 'recipe-123',
          Title: 'Test Recipe',
        },
      };

      // Act
      const result = await RecipeService.getRecipeById('recipe-999', allRecipes);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('filterRecipesByMealType', () => {
    it('should return all recipes when no filters', () => {
      // Arrange
      const recipes: S3JsonData = {
        'recipe-1': { key: 'recipe-1', Title: 'Recipe 1', Type: 'main dish' },
        'recipe-2': { key: 'recipe-2', Title: 'Recipe 2', Type: 'dessert' },
      };

      // Act
      const result = RecipeService.filterRecipesByMealType(recipes, []);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('recipe-1');
      expect(result).toContain('recipe-2');
    });

    it('should filter by single meal type', () => {
      // Arrange
      const recipes: S3JsonData = {
        'recipe-1': { key: 'recipe-1', Title: 'Recipe 1', Type: 'main dish' },
        'recipe-2': { key: 'recipe-2', Title: 'Recipe 2', Type: 'dessert' },
      };

      // Act
      const result = RecipeService.filterRecipesByMealType(recipes, ['dessert']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result).toContain('recipe-2');
    });

    it('should filter by multiple meal types', () => {
      // Arrange
      const recipes: S3JsonData = {
        'recipe-1': { key: 'recipe-1', Title: 'Recipe 1', Type: 'main dish' },
        'recipe-2': { key: 'recipe-2', Title: 'Recipe 2', Type: 'dessert' },
        'recipe-3': { key: 'recipe-3', Title: 'Recipe 3', Type: 'appetizer' },
      };

      // Act
      const result = RecipeService.filterRecipesByMealType(recipes, ['main dish', 'dessert']);

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('recipe-1');
      expect(result).toContain('recipe-2');
    });
  });
});
