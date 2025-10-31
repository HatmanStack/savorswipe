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

import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
 */
export const ImageGrid: React.FC<ImageGridProps> = ({
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

  // Handle thumbnail selection
  const handleThumbnailPress = (imageUrl: string) => {
    onSelectImage(imageUrl)
  }

  // Handle delete with confirmation
  const handleDelete = () => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to permanently delete this recipe?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: onDelete,
          style: 'destructive',
        },
      ]
    )
  }

  // Handle image load start
  const handleImageLoadStart = (imageUrl: string) => {
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
  }

  // Handle image load complete
  const handleImageLoadEnd = (imageUrl: string) => {
    setLoadingStates((prev) => ({
      ...prev,
      [imageUrl]: { isLoading: false, hasError: false, isLoaded: true },
    }))
  }

  // Handle image load error
  const handleImageError = (imageUrl: string) => {
    setLoadingStates((prev) => ({
      ...prev,
      [imageUrl]: { isLoading: false, hasError: true, isLoaded: false },
    }))
  }

  // Render individual thumbnail
  const renderThumbnail = ({ item: imageUrl }: { item: string }) => {
    const state = loadingStates[imageUrl] || { isLoading: true, hasError: false, isLoaded: false }

    return (
      <TouchableOpacity
        style={styles.thumbnailWrapper}
        onPress={() => handleThumbnailPress(imageUrl)}
        activeOpacity={0.8}
      >
        {state.hasError ? (
          // Error placeholder - use skillet.png as fallback
          <View style={styles.thumbnailError}>
            <Text style={styles.errorIcon}>🍳</Text>
            <Text style={styles.errorText}>No image</Text>
          </View>
        ) : state.isLoading && !state.isLoaded ? (
          // Skeleton placeholder while loading
          <View style={styles.skeletonPlaceholder}>
            <View style={styles.skeletonShimmer} />
          </View>
        ) : (
          // Actual image (cached or freshly loaded)
          <Image
            source={{ uri: imageUrl }}
            style={styles.thumbnail}
            onLoadStart={() => handleImageLoadStart(imageUrl)}
            onLoad={() => handleImageLoadEnd(imageUrl)}
            onError={() => handleImageError(imageUrl)}
            resizeMode="cover"
          />
        )}
      </TouchableOpacity>
    )
  }

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
            onPress={handleDelete}
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
    </TouchableOpacity>
  )
}

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
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#efefef',
  },
  skeletonPlaceholder: {
    width: '100%',
    height: '100%',
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
})
