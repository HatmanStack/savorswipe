/**
 * ImagePickerModal Component
 * Modal for selecting a recipe image from Google search results.
 *
 * Displays a 3x3 grid of thumbnail images, allowing user to:
 * - Select a thumbnail to preview full-size
 * - Confirm selection to apply image to recipe
 * - Delete recipe entirely
 * - Cancel without action
 *
 * PHASE 4 INTEGRATION GUIDE:
 * =========================
 * This is a controlled component that expects parent (useImageQueue hook) to provide:
 *
 * 1. recipe: Recipe with image_search_results array (9 Google image URLs)
 * 2. isVisible: boolean flag controlling modal visibility
 * 3. Callback implementations:
 *    - onConfirm(imageUrl): Fetch image from Google, save to S3, inject recipe into queue
 *    - onDelete(): Delete recipe atomically from combined_data.json and embeddings
 *    - onCancel(): Close modal, resume swipe queue
 *
 * Expected Recipe Structure:
 * {
 *   key: "recipe-key-123",
 *   Title: "Recipe Title",
 *   image_search_results: ["url1", "url2", ..., "url9"],
 *   ... other fields
 * }
 *
 * Modal Behavior:
 * - Grid View: Shows 3x3 thumbnail grid with delete button
 * - Preview View: User taps thumbnail to preview full-size with confirm button
 * - Back Button: Returns to grid view
 * - Delete Button: Shows confirmation alert before calling onDelete
 * - Cancel: Clicking overlay or onCancel closes modal without action
 */

import React, { useState, useCallback, useEffect, memo } from 'react'
import { Modal, View, StyleSheet } from 'react-native'
import { Recipe } from '@/types/index'
import { ImageGrid } from './ImageGrid'
import { ImagePreview } from './ImagePreview'

export interface ImagePickerModalProps {
  /** Recipe being displayed for image selection */
  recipe: Recipe | null;
  /** Whether modal is visible */
  isVisible: boolean;
  /**
   * Called when user selects an image URL to confirm.
   * Parent component should:
   * - Fetch the selected image from Google
   * - Upload to S3 at `images/{recipe_key}.jpg`
   * - Show toast: "Image saved"
   * - Inject recipe into image queue
   */
  onConfirm: (imageUrl: string) => void;
  /**
   * Called when user chooses to delete the recipe.
   * Parent component should:
   * - Delete recipe from `combined_data.json`
   * - Delete embedding from `recipe_embeddings.json`
   * - Show toast: "Recipe deleted"
   * - Continue with next recipe if available
   */
  onDelete: () => void;
  /** Called when user cancels without action */
  onCancel: () => void;
}

/**
 * ImagePickerModal displays recipe image selection flow.
 *
 * States:
 * - Grid View: Shows 3x3 grid of 9 image thumbnails
 * - Preview View: Shows full-size image with confirm button
 *
 * Memoized to prevent unnecessary re-renders
 */
const ImagePickerModalComponent: React.FC<ImagePickerModalProps> = ({
  recipe,
  isVisible,
  onConfirm,
  onDelete,
  onCancel,
}) => {

  // Track selected image URL (null = grid view, set = preview view)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

  // Reset state when recipe or visibility changes
  useEffect(() => {
    setSelectedImageUrl(null)
  }, [recipe?.key, isVisible])

  // Reset state when modal closes
  const handleCancel = useCallback(() => {
    setSelectedImageUrl(null)
    onCancel()
  }, [onCancel])

  // Handle image selection from grid
  const handleSelectImage = useCallback((imageUrl: string) => {
    setSelectedImageUrl(imageUrl)
  }, [])

  // Handle back from preview to grid
  const handleBackToGrid = useCallback(() => {
    setSelectedImageUrl(null)
  }, [])

  // Handle confirm selection
  const handleConfirm = useCallback((imageUrl: string) => {
    setSelectedImageUrl(null)
    onConfirm(imageUrl)
  }, [onConfirm])

  // Handle delete recipe
  const handleDelete = useCallback(() => {
    setSelectedImageUrl(null)
    onDelete()
  }, [onDelete])


  if (!recipe || !recipe.image_search_results || recipe.image_search_results.length === 0) {
    return null
  }


  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {selectedImageUrl === null ? (
          // Grid view - show thumbnail selection
          <ImageGrid
            recipeTitle={recipe.Title}
            imageUrls={recipe.image_search_results}
            onSelectImage={handleSelectImage}
            onDelete={handleDelete}
            onCancel={handleCancel}
          />
        ) : (
          // Preview view - show full-size image with confirm button
          <ImagePreview
            imageUrl={selectedImageUrl}
            onConfirm={handleConfirm}
            onBack={handleBackToGrid}
          />
        )}
      </View>
    </Modal>
  )
}

/**
 * Memoized ImagePickerModal component to prevent unnecessary re-renders
 */
export const ImagePickerModal = memo(ImagePickerModalComponent)

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
