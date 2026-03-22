import { useRecipe } from '@/context/RecipeContext';
import { ImageQueueHook } from '@/types/queue';
import { useQueueState } from './useQueueState';
import { useRecipeInjection } from './useRecipeInjection';

export function useImageQueue(): ImageQueueHook {
  const {
    jsonData, setCurrentRecipe,
    mealTypeFilters,
    pendingRecipeForPicker,
    enqueuePendingRecipe,
    addPendingInjectionKey,
    consumePendingInjectionKeys,
  } = useRecipe();

  const queueState = useQueueState({ jsonData, mealTypeFilters, setCurrentRecipe });

  const { injectRecipes } = useRecipeInjection({
    jsonData,
    setQueue: queueState.setQueue,
    setCurrentImage: queueState.setCurrentImage,
    setNextImage: queueState.setNextImage,
    setIsLoading: queueState.setIsLoading,
    recipeKeyPoolRef: queueState.recipeKeyPoolRef,
    lastInjectionTimeRef: queueState.lastInjectionTimeRef,
    nextImageRef: queueState.nextImageRef,
    enqueuePendingRecipe,
    consumePendingInjectionKeys,
  });

  // Derive modal visibility from context (GlobalImagePicker handles all modal interactions)
  const showImagePickerModal = pendingRecipeForPicker !== null;

  return {
    currentImage: queueState.currentImage,
    nextImage: queueState.nextImage,
    isLoading: queueState.isLoading,
    queueLength: queueState.queueLength,
    advanceQueue: queueState.advanceQueue,
    resetQueue: queueState.resetQueue,
    injectRecipes,
    showImagePickerModal,
  };
}
