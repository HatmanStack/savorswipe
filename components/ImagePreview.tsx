/**
 * ImagePreview Component
 * Displays a full-size preview of the selected image with confirm button.
 *
 * Features:
 * - Full-size image display
 * - Loading spinner while image loads
 * - Error handling with fallback message
 * - Back button to return to grid
 * - Confirm button to apply image
 */

import React, { useState } from 'react'
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native'

export interface ImagePreviewProps {
  /** Google image URL to display */
  imageUrl: string;
  /** Called when user confirms selection */
  onConfirm: (imageUrl: string) => void;
  /** Called when user goes back to grid */
  onBack: () => void;
}

/**
 * ImagePreview displays a full-size image preview.
 * Includes loading state and error handling.
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({
  imageUrl,
  onConfirm,
  onBack,
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Handle image load start
  const handleLoadStart = () => {
    setIsLoading(true)
    setHasError(false)
  }

  // Handle image load complete
  const handleLoadEnd = () => {
    setIsLoading(false)
  }

  // Handle image load error
  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // Handle confirm button
  const handleConfirm = () => {
    onConfirm(imageUrl)
  }

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Back to image grid"
        accessibilityRole="button"
      >
        <Text style={styles.backIcon}>‹</Text>
      </TouchableOpacity>

      {/* Image container with loading and error states */}
      <View style={styles.imageContainer}>
        {hasError ? (
          // Error state
          <View style={styles.errorContent}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>Failed to load image</Text>
            <Text style={styles.errorHint}>Please go back and try another image</Text>
          </View>
        ) : (
          <>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              onLoadStart={handleLoadStart}
              onLoad={handleLoadEnd}
              onError={handleError}
              resizeMode="contain"
            />
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#0a7ea4" />
              </View>
            )}
          </>
        )}
      </View>

      {/* Confirm button */}
      <TouchableOpacity
        style={styles.confirmButton}
        onPress={handleConfirm}
        activeOpacity={0.8}
        accessibilityLabel="Confirm image selection"
        accessibilityRole="button"
      >
        <Text style={styles.confirmButtonText}>Confirm & Apply Image</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'space-between',
    padding: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  backIcon: {
    fontSize: 32,
    color: 'white',
    fontWeight: '300',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  errorContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 18,
    color: 'white',
    marginBottom: 8,
    fontWeight: '500',
  },
  errorHint: {
    fontSize: 14,
    color: '#bbb',
  },
  confirmButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
})
