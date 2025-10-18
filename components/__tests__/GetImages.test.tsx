// GetImages.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import GetImages from '../GetImages';
import { RecipeProvider } from '@/context/RecipeContext';
import { RecipeService } from '@/services';

// Mock the services
jest.mock('@/services', () => ({
  RecipeService: {
    getRecipesFromS3: jest.fn(),
    filterRecipesByMealType: jest.fn(),
    shuffleRecipeKeys: jest.fn()
  },
  ImageService: {
    getImageFromS3: jest.fn(),
    getImageFileName: jest.fn(),
    getRecipeKeyFromFileName: jest.fn()
  }
}));

// Mock Dimensions.get
jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });

describe('GetImages Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    (RecipeService.getRecipesFromS3 as jest.Mock).mockResolvedValue({
      '1': { key: '1', Title: 'Test Recipe 1' },
      '2': { key: '2', Title: 'Test Recipe 2' },
      '3': { key: '3', Title: 'Test Recipe 3' }
    });

    (RecipeService.filterRecipesByMealType as jest.Mock).mockImplementation((data) =>
      Object.keys(data)
    );

    (RecipeService.shuffleRecipeKeys as jest.Mock).mockImplementation((keys) => keys);
  });

  it('should render without crashing', async () => {
    const mockSetImageDimensions = jest.fn();
    const mockSetFetchImage = jest.fn();

    const props = {
      getNewList: false,
      fetchImage: false,
      setFetchImage: mockSetFetchImage,
      setImageDimensions: mockSetImageDimensions
    };

    render(
      <RecipeProvider>
        <GetImages {...props} />
      </RecipeProvider>
    );

    await waitFor(() => {
      expect(RecipeService.getRecipesFromS3).toHaveBeenCalledTimes(1);
      expect(mockSetImageDimensions).toHaveBeenCalled();
    });
  });

  it('should call setImageDimensions with window dimensions on mount', async () => {
    const mockSetImageDimensions = jest.fn();
    const mockSetFetchImage = jest.fn();

    const props = {
      getNewList: false,
      fetchImage: false,
      setFetchImage: mockSetFetchImage,
      setImageDimensions: mockSetImageDimensions
    };

    render(
      <RecipeProvider>
        <GetImages {...props} />
      </RecipeProvider>
    );

    // Wait for async state updates to complete
    await waitFor(() => {
      expect(mockSetImageDimensions).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 375,
          height: 812
        })
      );
    });
  });
});