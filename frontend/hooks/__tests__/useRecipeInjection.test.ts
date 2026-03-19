import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useRecipeInjection } from '../useRecipeInjection';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageFile, S3JsonData, Recipe } from '@/types';
import React from 'react';

// Mock dependencies
jest.mock('@/services/ImageQueueService');
jest.mock('@/services/ImageService', () => ({
  ImageService: {
    getRecipeKeyFromFileName: jest.fn((filename: string) =>
      filename.replace('images/', '').replace('.jpg', '')
    ),
  },
}));

describe('useRecipeInjection', () => {
  const mockSetQueue = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile[]>>;
  const mockSetCurrentImage = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile | null>>;
  const mockSetNextImage = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile | null>>;
  const mockSetIsLoading = jest.fn() as unknown as React.Dispatch<React.SetStateAction<boolean>>;
  const mockSetPendingRecipeForPicker = jest.fn();

  const createDefaultOptions = (overrides: Record<string, unknown> = {}) => ({
    jsonData: {
      recipe1: { key: 'recipe1', Title: 'Recipe 1' },
      recipe2: { key: 'recipe2', Title: 'Recipe 2' },
    } as S3JsonData,
    setQueue: mockSetQueue,
    setCurrentImage: mockSetCurrentImage,
    setNextImage: mockSetNextImage,
    setIsLoading: mockSetIsLoading,
    recipeKeyPoolRef: { current: ['recipe3', 'recipe4'] },
    lastInjectionTimeRef: { current: 0 },
    nextImageRef: { current: null as ImageFile | null },
    pendingRecipe: null as Recipe | null,
    setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {});
  });

  it('injectRecipes fetches images and updates queue', async () => {
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
      images: [
        { filename: 'images/new1.jpg', file: 'blob:new1' },
      ],
      failedKeys: [],
    });

    const { result } = renderHook(() => useRecipeInjection(createDefaultOptions()));

    await act(async () => {
      await result.current.injectRecipes(['new1']);
    });

    expect(ImageQueueService.fetchBatch).toHaveBeenCalledWith(['new1'], 1);
    expect(mockSetQueue).toHaveBeenCalled();

    // Execute the functional updater to verify queue insertion logic
    const updater = (mockSetQueue as unknown as jest.Mock).mock.calls[0][0];
    const seedQueue: ImageFile[] = [
      { filename: 'images/existing1.jpg', file: 'blob:existing1' },
    ];
    const newQueue = updater(seedQueue);
    expect(newQueue.length).toBe(2);
    expect(newQueue[1].filename).toBe('images/new1.jpg');
  });

  it('does not re-add duplicate recipes already in queue', async () => {
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
      images: [
        { filename: 'images/recipe1.jpg', file: 'blob:dup1' },
      ],
      failedKeys: [],
    });

    const { result } = renderHook(() => useRecipeInjection(createDefaultOptions()));

    await act(async () => {
      await result.current.injectRecipes(['recipe1']);
    });

    // Execute the functional updater with a queue that already contains recipe1
    const updater = (mockSetQueue as unknown as jest.Mock).mock.calls[0][0];
    const seedQueue: ImageFile[] = [
      { filename: 'images/recipe1.jpg', file: 'blob:existing' },
    ];
    const newQueue = updater(seedQueue);
    // Duplicate should be filtered out, queue unchanged
    expect(newQueue).toEqual(seedQueue);
  });

  it('auto-detects new keys in jsonData and triggers injection', async () => {
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
      images: [{ filename: 'images/new1.jpg', file: 'blob:new1' }],
      failedKeys: [],
    });

    const initialData: S3JsonData = {
      recipe1: { key: 'recipe1', Title: 'Recipe 1' },
    };

    const options = createDefaultOptions({ jsonData: initialData });
    const { rerender } = renderHook(
      ({ opts }: { opts: any }) => useRecipeInjection(opts),
      { initialProps: { opts: options } }
    );

    // Now add a new recipe
    const updatedData: S3JsonData = {
      recipe1: { key: 'recipe1', Title: 'Recipe 1' },
      new1: { key: 'new1', Title: 'New Recipe', image_url: 'http://example.com/img.jpg' },
    };

    rerender({
      opts: createDefaultOptions({ jsonData: updatedData }),
    });

    await waitFor(() => {
      expect(ImageQueueService.fetchBatch).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('pending image selection pauses injection', () => {
    const pendingData: S3JsonData = {
      recipe1: { key: 'recipe1', Title: 'Recipe 1' },
    };

    const options = createDefaultOptions({ jsonData: pendingData });
    const { rerender } = renderHook(
      ({ opts }: { opts: any }) => useRecipeInjection(opts),
      { initialProps: { opts: options } }
    );

    // Add a recipe with pending image selection
    const updatedData: S3JsonData = {
      recipe1: { key: 'recipe1', Title: 'Recipe 1' },
      pending1: {
        key: 'pending1',
        Title: 'Pending',
        image_search_results: ['http://example.com/img.jpg'],
        image_url: null,
      },
    };

    rerender({
      opts: createDefaultOptions({ jsonData: updatedData }),
    });

    // Should set pending recipe instead of injecting
    expect(mockSetPendingRecipeForPicker).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending1' })
    );
  });

  it('handles empty array without errors', async () => {
    const { result } = renderHook(() => useRecipeInjection(createDefaultOptions()));

    await act(async () => {
      await result.current.injectRecipes([]);
    });

    expect(ImageQueueService.fetchBatch).not.toHaveBeenCalled();
  });
});
