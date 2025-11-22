/**
 * ImageGrid Component
 * Displays a 3x3 grid of recipe image thumbnails from Google search results.
 *
 * Features:
 * - Recipe title at top
 * - Delete button (top-right)
 * - 3-column grid of square thumbnail images
 * - Tap thumbnail to preview full-size
 * - Loading and error states for thumbnails
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native'

export interface ImageGridProps {
  /** Recipe title to display at top */
  recipeTitle: string;
  /** Array of 9 Google image URLs */
  imageUrls: string[];
  /** Called when user taps a thumbnail */
  onSelectImage: (imageUrl: string) => void;
  /** Called when user taps delete button */
  onDelete: () => void;
  /** Called when user dismisses modal */
  onCancel: () => void;
}

interface ThumbnailState {
  isLoading: boolean;
  hasError: boolean;
  isLoaded: boolean; // Track if image has successfully loaded (for caching)
}

/**
 * ImageGrid displays a 3x3 grid of image thumbnails.
 * Each thumbnail can be tapped to preview full-size.
 *
 * Features:
 * - Skeleton/placeholder while loading
 * - Image caching to prevent re-fetching
 * - Error handling with fallback UI
 * - Tap to preview full-size
 * - Memoized to prevent unnecessary re-renders
 */
const ImageGridComponent: React.FC<ImageGridProps> = ({
  recipeTitle,
  imageUrls,
  onSelectImage,
  onDelete,
  onCancel,
}) => {
  // Track loading/caching state per image URL
  const [loadingStates, setLoadingStates] = useState<Record<string, ThumbnailState>>(() => {
    // Initialize all images as loading
    const initial: Record<string, ThumbnailState> = {}
    imageUrls.forEach((url) => {
      initial[url] = { isLoading: true, hasError: false, isLoaded: false }
    })
    return initial
  })

  // Track delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Handle thumbnail selection
  const handleThumbnailPress = useCallback((imageUrl: string) => {
    onSelectImage(imageUrl)
  }, [onSelectImage])

  // Handle delete button press - show confirmation
  const handleDeletePress = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  // Handle confirmed deletion
  const handleDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false)
    onDelete()
  }, [onDelete])

  // Handle cancel deletion
  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  // Handle image load start
  const handleImageLoadStart = useCallback((imageUrl: string) => {
    setLoadingStates((prev) => {
      const current = prev[imageUrl]
      // Only set loading if not already loaded (caching)
      if (current?.isLoaded) {
        return prev
      }
      return {
        ...prev,
        [imageUrl]: { isLoading: true, hasError: false, isLoaded: false },
      }
    })
  }, [])

  // Handle image load complete
  const handleImageLoadEnd = useCallback((imageUrl: string) => {
    setLoadingStates((prev) => ({
      ...prev,
      [imageUrl]: { isLoading: false, hasError: false, isLoaded: true },
    }))
  }, [])

  // Handle image load error
  const handleImageError = useCallback((imageUrl: string) => {
    setLoadingStates((prev) => ({
      ...prev,
      [imageUrl]: { isLoading: false, hasError: true, isLoaded: false },
    }))
  }, [])

  // Render individual thumbnail
  const renderThumbnail = useCallback(({ item: imageUrl }: { item: string }) => {
    const state = loadingStates[imageUrl] || { isLoading: true, hasError: false, isLoaded: false }

    // Always mount Image component unconditionally so onLoad/onLoadStart/onError callbacks fire
    // Overlay skeleton and error states on top using absolute positioning
    return (
      <TouchableOpacity
        style={styles.thumbnailWrapper}
        onPress={() => handleThumbnailPress(imageUrl)}
        activeOpacity={0.8}
        testID="image-thumbnail"
      >
        <View style={styles.thumbnailInner}>
          <Image
            source={{ uri: imageUrl }}
            style={[
              styles.thumbnail,
              (state.isLoading || state.hasError) ? styles.thumbnailHidden : null,
            ]}
            onLoadStart={() => handleImageLoadStart(imageUrl)}
            onLoad={() => handleImageLoadEnd(imageUrl)}
            onError={() => handleImageError(imageUrl)}
            resizeMode="cover"
          />
          {state.isLoading && !state.hasError && (
            <View style={[styles.overlayContent, styles.skeletonPlaceholder]}>
              <View style={styles.skeletonShimmer} />
            </View>
          )}
          {state.hasError && (
            <View style={[styles.overlayContent, styles.thumbnailError]}>
              <Text style={styles.errorIcon}>🍳</Text>
              <Text style={styles.errorText}>No image</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }, [loadingStates, handleThumbnailPress, handleImageLoadStart, handleImageLoadEnd, handleImageError])

  return (
    <TouchableOpacity
      style={styles.overlay}
      activeOpacity={1}
      onPress={onCancel}
    >
      <TouchableOpacity
        style={styles.contentCard}
        activeOpacity={1}
        onPress={(e) => e.stopPropagation()}
      >
        {/* Header with recipe title and delete button */}
        <View style={styles.header}>
          <Text style={styles.recipeTitle}>{recipeTitle}</Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeletePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Delete recipe"
            accessibilityRole="button"
          >
            <Text style={styles.deleteIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Grid of thumbnails */}
        <FlatList
          data={imageUrls}
          renderItem={renderThumbnail}
          keyExtractor={(item) => item}
          numColumns={3}
          scrollEnabled={true}
          style={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          ItemSeparatorComponent={() => <View style={styles.spacer} />}
          scrollIndicatorInsets={{ right: 1 }}
        />
      </TouchableOpacity>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDeleteCancel}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete Recipe</Text>
            <Text style={styles.confirmMessage}>
              Are you sure you want to permanently delete this recipe?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={handleDeleteCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel deletion"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteButtonConfirm]}
                onPress={handleDeleteConfirm}
                accessibilityRole="button"
                accessibilityLabel="Confirm deletion"
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </TouchableOpacity>
  )
}

/**
 * Memoized ImageGrid component to prevent unnecessary re-renders
 * when parent props haven't changed
 */
export const ImageGrid = React.memo(ImageGridComponent)

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  recipeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#11181C',
    flex: 1,
    marginRight: 12,
    lineHeight: 28,
  },
  deleteButton: {
    padding: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
  },
  deleteIcon: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
  },
  gridContainer: {
    flex: 1,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  spacer: {
    height: 12,
  },
  thumbnailWrapper: {
    flex: 1,
    aspectRatio: 1,
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    // Ensure 44pt minimum touch target
    minHeight: 44,
  },
  thumbnailInner: {
    flex: 1,
    position: 'relative',
  },
  overlayContent: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#efefef',
  },
  thumbnailHidden: {
    opacity: 0,
  },
  skeletonPlaceholder: {
    flex: 1,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonShimmer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d8d8d8',
  },
  thumbnailError: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontWeight: '500',
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 16,
    color: '#687076',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#11181C',
  },
  deleteButtonConfirm: {
    backgroundColor: '#dc2626',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})
