import { useRecipe } from '@/context/RecipeContext';
import { ImageQueueHook } from '@/types/queue';
import { useQueueState } from './useQueueState';
import { useRecipeInjection } from './useRecipeInjection';
import { useImagePicker } from './useImagePicker';

export function useImageQueue(): ImageQueueHook {
  const {
    jsonData, setCurrentRecipe, setJsonData,
    mealTypeFilters, pendingRecipeForPicker, setPendingRecipeForPicker
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
    pendingRecipe: pendingRecipeForPicker,
    setPendingRecipeForPicker,
  });

  const imagePicker = useImagePicker({
    jsonData, setJsonData,
    pendingRecipeForPicker, setPendingRecipeForPicker,
    injectRecipes,
  });

  return {
    currentImage: queueState.currentImage,
    nextImage: queueState.nextImage,
    isLoading: queueState.isLoading,
    queueLength: queueState.queueLength,
    advanceQueue: queueState.advanceQueue,
    resetQueue: queueState.resetQueue,
    injectRecipes,
    pendingRecipe: imagePicker.pendingRecipe,
    showImagePickerModal: imagePicker.showImagePickerModal,
    resetPendingRecipe: imagePicker.resetPendingRecipe,
    onConfirmImage: imagePicker.onConfirmImage,
    onDeleteRecipe: imagePicker.onDeleteRecipe,
  };
}
