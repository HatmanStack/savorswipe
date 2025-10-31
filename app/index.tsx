import 'react-native-gesture-handler';
import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Image, View, Animated, AccessibilityInfo } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { useImageQueue } from '@/hooks/useImageQueue';
import { useResponsiveLayout } from '@/hooks';
import { isNewRecipe } from '@/services/RecipeService';
import NewRecipeBanner from '@/components/NewRecipeBanner';
import ImagePickerModal from '@/components/ImagePickerModal';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

// Animation configuration for new recipe pulse effect
const ANIMATION_CONFIG = {
  PULSE_CYCLES: 3,        // Number of pulse cycles
  PULSE_SCALE: 1.05,      // Scale factor (1.05 = 5% growth, subtle)
  PULSE_DURATION: 300,    // Duration per phase (ms)
};

export default function HomeScreen() {
  const router = useRouter();
  const { currentRecipe } = useRecipe();

  // Use new queue hook
  const {
    currentImage,
    advanceQueue,
    isLoading,
    pendingRecipe,
    showImagePickerModal,
    onConfirmImage,
    onDeleteRecipe,
    resetPendingRecipe,
  } = useImageQueue();

  // Animation value for simple translateX
  const currentImageTranslateX = useRef(new Animated.Value(0)).current;

  // Animation for pulse effect on new recipes
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  const { getImageDimensions } = useResponsiveLayout();
  const imageDimensions = getImageDimensions();

  // Determine if current recipe should show "new" banner
  const showBanner = useMemo(() => {
    if (!currentRecipe) return false;
    return isNewRecipe(currentRecipe);
  }, [currentRecipe]);

  // Check for reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      setReduceMotion(enabled);
    });
  }, []);

  // Helper function to create pulse animation sequence
  const createPulseAnimation = useCallback(() => {
    const cycles = [];
    for (let i = 0; i < ANIMATION_CONFIG.PULSE_CYCLES; i++) {
      cycles.push(
        Animated.timing(pulseAnim, {
          toValue: ANIMATION_CONFIG.PULSE_SCALE,
          duration: ANIMATION_CONFIG.PULSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: ANIMATION_CONFIG.PULSE_DURATION,
          useNativeDriver: true,
        })
      );
    }
    return Animated.sequence(cycles);
  }, [pulseAnim]);

  // Trigger pulse animation when new recipe is displayed
  useEffect(() => {
    // Only animate if banner is visible and reduced motion is disabled
    if (!showBanner || reduceMotion) {
      return;
    }

    // Reset animation value
    pulseAnim.setValue(1);

    // Start pulse animation
    const animation = createPulseAnimation();
    animation.start();

    // Cleanup function to stop animation
    return () => {
      pulseAnim.stopAnimation();
    };
  }, [currentImage?.filename, showBanner, reduceMotion, pulseAnim, createPulseAnimation]);

  // Handle swipe gestures
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    // Don't allow swiping while image picker modal is open
    if (showImagePickerModal) {
      return;
    }

    if (direction === 'left') {
      // Swipe left: advance to next recipe
      advanceQueue();
    } else if (direction === 'right') {
      // Swipe right: navigate to recipe detail
      if (currentRecipe?.key) {
        router.push(`/recipe/${currentRecipe.key}`);
      }
    }
  }, [advanceQueue, currentRecipe?.key, router, showImagePickerModal]);

  // Debounce function (keep existing)
  const debounce = <T extends (...args: any[]) => void>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  // Memoize debounced handler, recreating when handleSwipe changes
  const debouncedHandleSwipe = useMemo(() => debounce(handleSwipe, 100), [handleSwipe]);

  // Show loading state
  if (isLoading || !currentImage) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Image
          source={holderImg}
          style={{ width: 200, height: 200 }}
        />
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <PanGestureHandler
        onGestureEvent={(event) => {
          if (event.nativeEvent.translationX < -30) {
            debouncedHandleSwipe('left');
          } else if (event.nativeEvent.translationX > 30) {
            debouncedHandleSwipe('right');
          }
        }}
        minDist={30}
        minVelocity={0.5}
      >
        <Animated.View style={{ transform: [{ translateX: currentImageTranslateX }, { scale: pulseAnim }] }}>
          <Image
            source={{ uri: currentImage.file }}
            style={{
              width: imageDimensions.width,
              height: imageDimensions.height,
              alignSelf: 'center',
              resizeMode: 'cover',
            }}
          />
        </Animated.View>
      </PanGestureHandler>
      <NewRecipeBanner visible={showBanner} />

      {/* Image Picker Modal for recipes pending image selection */}
      <ImagePickerModal
        isVisible={showImagePickerModal}
        recipe={pendingRecipe}
        onConfirm={onConfirmImage}
        onDelete={onDeleteRecipe}
        onCancel={resetPendingRecipe}
      />
    </View>
  );
}
