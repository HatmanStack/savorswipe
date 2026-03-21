import { renderHook } from '@testing-library/react-native';
import { useRecipeInjection } from '../useRecipeInjection';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageFile, S3JsonData } from '@/types';
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

/**
 * Integration-level tests for the sequential upload scenario.
 * These tests validate the specific bug that was fixed:
 * prevJsonDataKeysRef was only partially updated, causing new recipe
 * keys to be permanently missed when a pending recipe was active.
 */
describe('useRecipeInjection - sequential upload scenarios', () => {
  const mockSetQueue = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile[]>>;
  const mockSetCurrentImage = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile | null>>;
  const mockSetNextImage = jest.fn() as unknown as React.Dispatch<React.SetStateAction<ImageFile | null>>;
  const mockSetIsLoading = jest.fn() as unknown as React.Dispatch<React.SetStateAction<boolean>>;
  const mockEnqueuePendingRecipe = jest.fn();

  // Create refs ONCE so they persist across rerenders like production
  const recipeKeyPoolRef = { current: [] as string[] };
  const lastInjectionTimeRef = { current: 0 };
  const nextImageRef = { current: null as ImageFile | null };

  const createDefaultOptions = (overrides: Record<string, unknown> = {}) => ({
    jsonData: null as S3JsonData | null,
    setQueue: mockSetQueue,
    setCurrentImage: mockSetCurrentImage,
    setNextImage: mockSetNextImage,
    setIsLoading: mockSetIsLoading,
    recipeKeyPoolRef,
    lastInjectionTimeRef,
    nextImageRef,
    enqueuePendingRecipe: mockEnqueuePendingRecipe,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    recipeKeyPoolRef.current = [];
    lastInjectionTimeRef.current = 0;
    nextImageRef.current = null;
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
      images: [],
      failedKeys: [],
    });
    (ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {});
  });

  it('sequential uploads: both image pickers are presented', () => {
    // Start with existing recipes
    const initialData: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
    };

    const options = createDefaultOptions({ jsonData: initialData });
    const { rerender } = renderHook(
      ({ opts }: { opts: any }) => useRecipeInjection(opts),
      { initialProps: { opts: options } }
    );

    // First upload completes: newRecipe1 needs image selection
    const afterFirstUpload: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
      newRecipe1: {
        key: 'newRecipe1',
        Title: 'New Recipe 1',
        image_search_results: ['http://example.com/img1.jpg'],
        image_url: null,
      },
    };

    rerender({ opts: createDefaultOptions({ jsonData: afterFirstUpload }) });

    expect(mockEnqueuePendingRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'newRecipe1' })
    );

    jest.clearAllMocks();

    // Simulate user confirming image for newRecipe1 (now has image_url)
    // Second upload also completes: newRecipe2 needs image selection
    const afterSecondUpload: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
      newRecipe1: {
        key: 'newRecipe1',
        Title: 'New Recipe 1',
        image_url: 'http://example.com/confirmed.jpg',
      },
      newRecipe2: {
        key: 'newRecipe2',
        Title: 'New Recipe 2',
        image_search_results: ['http://example.com/img2.jpg'],
        image_url: null,
      },
    };

    rerender({ opts: createDefaultOptions({ jsonData: afterSecondUpload }) });

    // The critical assertion: newRecipe2 must NOT be silently dropped
    expect(mockEnqueuePendingRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'newRecipe2' })
    );
  });

  it('concurrent uploads: second recipe not dropped while first is pending', () => {
    // Start with existing recipes
    const initialData: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
    };

    const options = createDefaultOptions({ jsonData: initialData });
    const { rerender } = renderHook(
      ({ opts }: { opts: any }) => useRecipeInjection(opts),
      { initialProps: { opts: options } }
    );

    // First upload: pending1 arrives
    const afterFirstUpload: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
      pending1: {
        key: 'pending1',
        Title: 'Pending 1',
        image_search_results: ['http://example.com/img1.jpg'],
        image_url: null,
      },
    };

    rerender({ opts: createDefaultOptions({ jsonData: afterFirstUpload }) });
    expect(mockEnqueuePendingRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending1' })
    );

    jest.clearAllMocks();

    // WITHOUT confirming pending1, second upload arrives with pending2
    const afterSecondUpload: S3JsonData = {
      existing1: { key: 'existing1', Title: 'Existing', image_url: 'http://img.jpg' },
      pending1: {
        key: 'pending1',
        Title: 'Pending 1',
        image_search_results: ['http://example.com/img1.jpg'],
        image_url: null,
      },
      pending2: {
        key: 'pending2',
        Title: 'Pending 2',
        image_search_results: ['http://example.com/img2.jpg'],
        image_url: null,
      },
    };

    rerender({ opts: createDefaultOptions({ jsonData: afterSecondUpload }) });

    // The critical assertion: pending2 must be enqueued (not dropped due to pending1 being active)
    expect(mockEnqueuePendingRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending2' })
    );
    // pending1 should NOT be re-enqueued (already processed)
    expect(mockEnqueuePendingRecipe).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending1' })
    );
  });
});
