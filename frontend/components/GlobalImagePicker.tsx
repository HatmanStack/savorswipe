import React from 'react';
import { useRecipe } from '@/context/RecipeContext';
import { useImagePicker } from '@/hooks/useImagePicker';
import { ImagePickerModal } from './ImagePickerModal';

/**
 * Layout-level image picker component.
 * Renders ImagePickerModal from RecipeContext state so it's available on any route.
 */
export function GlobalImagePicker() {
  const {
    jsonData, setJsonData,
    pendingRecipeForPicker,
    dequeuePendingRecipe,
    addPendingInjectionKey,
  } = useRecipe();

  const {
    pendingRecipe, showImagePickerModal,
    onConfirmImage, onDeleteRecipe, resetPendingRecipe,
  } = useImagePicker({
    jsonData, setJsonData,
    pendingRecipeForPicker,
    dequeuePendingRecipe,
    onRecipeConfirmed: addPendingInjectionKey,
  });

  if (!showImagePickerModal) return null;

  return (
    <ImagePickerModal
      isVisible={showImagePickerModal}
      recipe={pendingRecipe}
      onConfirm={onConfirmImage}
      onDelete={onDeleteRecipe}
      onCancel={resetPendingRecipe}
    />
  );
}
