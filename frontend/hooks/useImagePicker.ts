import { useState, useCallback, useMemo } from 'react';
import { RecipeService } from '@/services/RecipeService';
import { ToastQueue } from '@/components/Toast';
import { Recipe, S3JsonData } from '@/types';

// ============================================================================
// Error Transformation
// ============================================================================

/**
 * Declarative error pattern mapping.
 * Order matters: more specific patterns must come before generic ones.
 */
export const ERROR_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /timeout|request timeout/i, message: 'Taking longer than expected. Please check your internet and try again.' },
  { pattern: /recipe not found|404/i, message: 'Recipe not found. It may have been deleted.' },
  { pattern: /invalid image url|invalid url|400/i, message: "Image couldn't be loaded. Please select another image." },
  { pattern: /500|server error/i, message: 'Server error. Please try again later.' },
  { pattern: /fetch image from google/i, message: "Image couldn't be loaded from source. Please select another image." },
  { pattern: /network|failed/i, message: 'Unable to connect. Please check your internet connection.' },
];

/**
 * Transform raw error messages into user-friendly messages.
 * Maps technical errors to actionable, non-technical language.
 *
 * @param rawError - Raw error message from backend or network
 * @returns User-friendly error message
 */
export function transformErrorMessage(rawError: string): string {
  const match = ERROR_PATTERNS.find(({ pattern }) => pattern.test(rawError));
  return match?.message ?? 'An error occurred. Please try again.';
}

// ============================================================================
// Types
// ============================================================================

export interface UseImagePickerOptions {
  jsonData: S3JsonData | null;
  setJsonData: React.Dispatch<React.SetStateAction<S3JsonData | null>>;
  pendingRecipeForPicker: Recipe | null;
  dequeuePendingRecipe: () => void;
  onRecipeConfirmed: (recipeKey: string) => void;
}

export interface ImagePickerReturn {
  pendingRecipe: Recipe | null;
  showImagePickerModal: boolean;
  isSubmitting: boolean;
  onConfirmImage: (imageUrl: string) => Promise<void>;
  onDeleteRecipe: () => Promise<void>;
  resetPendingRecipe: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useImagePicker({
  jsonData,
  setJsonData,
  pendingRecipeForPicker,
  dequeuePendingRecipe,
  onRecipeConfirmed,
}: UseImagePickerOptions): ImagePickerReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive modal visibility from context state
  const showImagePickerModal = useMemo(() => pendingRecipeForPicker !== null, [pendingRecipeForPicker]);
  const pendingRecipe = useMemo(() => pendingRecipeForPicker, [pendingRecipeForPicker]);

  // Reset pending recipe state (dequeue from front of queue)
  const resetPendingRecipe = useCallback(() => {
    dequeuePendingRecipe();
  }, [dequeuePendingRecipe]);

  // Handle image selection confirmation
  const onConfirmImage = useCallback(
    async (imageUrl: string) => {
      if (!pendingRecipe || !jsonData || isSubmitting) {
        return;
      }

      // Capture recipe key before clearing state
      const recipeKey = pendingRecipe.key;

      setIsSubmitting(true);
      ToastQueue.show('Saving image selection...');

      try {
        // Call backend to select image
        const updatedRecipe = await RecipeService.selectRecipeImage(
          recipeKey,
          imageUrl
        );

        // Update local jsonData with the returned recipe (functional updater to avoid stale closure)
        setJsonData(prev => prev ? { ...prev, [recipeKey]: updatedRecipe } : prev);

        // Signal that this recipe's image was confirmed
        onRecipeConfirmed(recipeKey);

        // Dequeue to show next pending recipe (or close modal)
        dequeuePendingRecipe();

        ToastQueue.show('Image saved');
      } catch (error) {
        const rawError =
          error instanceof Error ? error.message : 'Unknown error occurred';
        const userFriendlyError = transformErrorMessage(rawError);

        ToastQueue.show(`Failed to save image: ${userFriendlyError}`);
        // Keep modal open on failure so user can retry
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingRecipe, jsonData, isSubmitting, setJsonData, onRecipeConfirmed, dequeuePendingRecipe]
  );

  // Handle recipe deletion
  const onDeleteRecipe = useCallback(async () => {
    if (!pendingRecipe || !jsonData || isSubmitting) {
      return;
    }

    // Capture recipe key before clearing state
    const recipeKey = pendingRecipe.key;

    setIsSubmitting(true);
    ToastQueue.show('Deleting recipe...');

    try {
      // Call backend to delete recipe
      await RecipeService.deleteRecipe(recipeKey);

      // Remove recipe from local jsonData (functional updater to avoid stale closure)
      setJsonData(prev => {
        if (!prev) return prev;
        const { [recipeKey]: _, ...rest } = prev;
        return rest;
      });

      // Dequeue to show next pending recipe (or close modal)
      dequeuePendingRecipe();

      ToastQueue.show('Recipe deleted');
    } catch (error) {
      const rawError =
        error instanceof Error ? error.message : 'Unknown error occurred';
      const userFriendlyError = transformErrorMessage(rawError);

      ToastQueue.show(`Failed to delete recipe: ${userFriendlyError}`);
      // Keep modal open on failure so user can retry
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingRecipe, jsonData, isSubmitting, setJsonData, dequeuePendingRecipe]);

  return {
    pendingRecipe,
    showImagePickerModal,
    isSubmitting,
    onConfirmImage,
    onDeleteRecipe,
    resetPendingRecipe,
  };
}
