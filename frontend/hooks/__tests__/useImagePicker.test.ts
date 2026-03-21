import { renderHook, act } from '@testing-library/react-native';
import { useImagePicker } from '../useImagePicker';
import { RecipeService } from '@/services/RecipeService';
import { ToastQueue } from '@/components/Toast';
import { S3JsonData, Recipe } from '@/types';

// Mock dependencies
jest.mock('@/services/RecipeService');
jest.mock('@/components/Toast');

describe('useImagePicker', () => {
  const mockJsonData: S3JsonData = {
    recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
    recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
  };

  const mockPendingRecipe: Recipe = {
    key: 'pending1',
    Title: 'Pending Recipe',
    image_search_results: ['https://example.com/img1.jpg'],
    image_url: null,
  };

  const mockSetJsonData = jest.fn();
  const mockDequeuePendingRecipe = jest.fn();
  const mockOnRecipeConfirmed = jest.fn();

  const createDefaultOptions = (overrides: Record<string, unknown> = {}) => ({
    jsonData: mockJsonData,
    setJsonData: mockSetJsonData,
    pendingRecipeForPicker: null as Recipe | null,
    dequeuePendingRecipe: mockDequeuePendingRecipe,
    onRecipeConfirmed: mockOnRecipeConfirmed,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (ToastQueue.show as jest.Mock).mockImplementation(() => {});
    (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
      key: 'pending1',
      Title: 'Pending Recipe',
      image_url: 'https://example.com/selected.jpg',
    });
    (RecipeService.deleteRecipe as jest.Mock).mockResolvedValue(true);
  });

  it('onConfirmImage calls RecipeService, updates jsonData, and calls onRecipeConfirmed', async () => {
    const pendingData: S3JsonData = {
      ...mockJsonData,
      pending1: mockPendingRecipe,
    };

    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        jsonData: pendingData,
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    await act(async () => {
      await result.current.onConfirmImage('https://example.com/selected.jpg');
    });

    expect(RecipeService.selectRecipeImage).toHaveBeenCalledWith(
      'pending1',
      'https://example.com/selected.jpg'
    );
    expect(mockSetJsonData).toHaveBeenCalled();

    // Verify the state updater produces the correct jsonData
    const updater = mockSetJsonData.mock.calls[0][0];
    const updatedData = updater(pendingData);
    expect(updatedData.pending1).toEqual({
      key: 'pending1',
      Title: 'Pending Recipe',
      image_url: 'https://example.com/selected.jpg',
    });
    // Sibling recipes should be preserved
    expect(updatedData.recipe1).toEqual(mockJsonData.recipe1);

    expect(mockOnRecipeConfirmed).toHaveBeenCalledWith('pending1');
    // Modal should be cleared on success via dequeue
    expect(mockDequeuePendingRecipe).toHaveBeenCalled();
    expect(ToastQueue.show).toHaveBeenCalledWith('Image saved');
  });

  it('onDeleteRecipe calls RecipeService, removes from jsonData, and dequeues', async () => {
    const pendingData: S3JsonData = {
      ...mockJsonData,
      pending1: mockPendingRecipe,
    };

    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        jsonData: pendingData,
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    await act(async () => {
      await result.current.onDeleteRecipe();
    });

    expect(RecipeService.deleteRecipe).toHaveBeenCalledWith('pending1');
    expect(mockSetJsonData).toHaveBeenCalled();

    // Verify the state updater removes the recipe and preserves siblings
    const updater = mockSetJsonData.mock.calls[0][0];
    const updatedData = updater(pendingData);
    expect(updatedData.pending1).toBeUndefined();
    expect(updatedData.recipe1).toEqual(mockJsonData.recipe1);
    expect(updatedData.recipe2).toEqual(mockJsonData.recipe2);

    // Modal should be cleared on success via dequeue
    expect(mockDequeuePendingRecipe).toHaveBeenCalled();
    expect(ToastQueue.show).toHaveBeenCalledWith('Recipe deleted');
  });

  it('resetPendingRecipe dequeues', () => {
    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    act(() => {
      result.current.resetPendingRecipe();
    });

    expect(mockDequeuePendingRecipe).toHaveBeenCalled();
  });

  it('showImagePickerModal derived state', () => {
    // Without pending recipe
    const { result: resultNoPending } = renderHook(() =>
      useImagePicker(createDefaultOptions())
    );
    expect(resultNoPending.current.showImagePickerModal).toBe(false);

    // With pending recipe
    const { result: resultWithPending } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );
    expect(resultWithPending.current.showImagePickerModal).toBe(true);
  });

  it('error handling shows toast with user-friendly message', async () => {
    const pendingData: S3JsonData = {
      ...mockJsonData,
      pending1: mockPendingRecipe,
    };

    (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        jsonData: pendingData,
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    await act(async () => {
      await result.current.onConfirmImage('https://example.com/selected.jpg');
    });

    expect(ToastQueue.show).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save image')
    );
    // Modal should remain visible (dequeue not called on error)
    expect(mockDequeuePendingRecipe).not.toHaveBeenCalled();
  });

  it('confirming image dequeues and shows next pending recipe', async () => {
    const pendingData: S3JsonData = {
      ...mockJsonData,
      pending1: mockPendingRecipe,
    };

    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        jsonData: pendingData,
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    await act(async () => {
      await result.current.onConfirmImage('https://example.com/selected.jpg');
    });

    expect(mockDequeuePendingRecipe).toHaveBeenCalledTimes(1);
  });

  it('deleting recipe dequeues and shows next pending recipe', async () => {
    const pendingData: S3JsonData = {
      ...mockJsonData,
      pending1: mockPendingRecipe,
    };

    const { result } = renderHook(() =>
      useImagePicker(createDefaultOptions({
        jsonData: pendingData,
        pendingRecipeForPicker: mockPendingRecipe,
      }))
    );

    await act(async () => {
      await result.current.onDeleteRecipe();
    });

    expect(mockDequeuePendingRecipe).toHaveBeenCalledTimes(1);
  });
});
