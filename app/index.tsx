import 'react-native-gesture-handler';
import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { Image, View, Animated } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { useImageQueue } from '@/hooks/useImageQueue';
import { useResponsiveLayout } from '@/hooks';
import { ImageQueueService } from '@/services/ImageQueueService';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

// Use shared animation duration from service config
const ANIM_DURATION = ImageQueueService.CONFIG.ANIMATION_DURATION;

export default function HomeScreen() {
  const router = useRouter();
  const { currentRecipe } = useRecipe();

  // Use new queue hook
  const { currentImage, nextImage, advanceQueue, isLoading } = useImageQueue();

  // Animation values
  const currentImageTranslateX = useRef(new Animated.Value(0)).current;
  const nextImageTranslateX = useRef(new Animated.Value(0)).current; // Will be set to width on mount
  const isAnimatingRef = useRef(false); // Prevent overlapping animations

  const { getImageDimensions } = useResponsiveLayout();
  const imageDimensions = getImageDimensions();

  // Update animation positions when dimensions change (responsive)
  useEffect(() => {
    // Set nextImage to start off-screen right
    nextImageTranslateX.setValue(imageDimensions.width);
  }, [imageDimensions.width, nextImageTranslateX]);

  // Animate slide transition (memoized with responsive width)
  const animateSwipe = useCallback((onComplete: () => void) => {
    // Set animating flag to prevent concurrent animations
    isAnimatingRef.current = true;

    // Use responsive width for animations
    const offScreenWidth = imageDimensions.width;

    // Run both animations in parallel for smooth transition
    Animated.parallel([
      // Slide current image out to left
      Animated.timing(currentImageTranslateX, {
        toValue: -offScreenWidth,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      // Slide next image in from right
      Animated.timing(nextImageTranslateX, {
        toValue: 0,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      })
    ]).start(() => {
      // After animation completes, update queue
      onComplete();

      // Reset animation values for next swipe using responsive width
      currentImageTranslateX.setValue(0);
      nextImageTranslateX.setValue(offScreenWidth);

      // Reset animating flag
      isAnimatingRef.current = false;
    });
  }, [imageDimensions.width, currentImageTranslateX, nextImageTranslateX]);

  // Handle swipe gestures (memoized to avoid stale closure)
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    // Prevent overlapping animations
    if (isAnimatingRef.current) return;

    if (direction === 'left') {
      // Swipe left: advance to next recipe
      animateSwipe(() => advanceQueue());
    } else if (direction === 'right') {
      // Swipe right: navigate to recipe detail
      if (currentRecipe?.key) {
        router.push(`/recipe/${currentRecipe.key}`);
      }
    }
  }, [animateSwipe, advanceQueue, currentRecipe?.key, router]);

  // Debounce function (keep existing)
  const debounce = (func: (...args: unknown[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: unknown[]) => {
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
        <View style={{
          position: 'relative',
          width: imageDimensions.width,
          height: imageDimensions.height,
        }}>
          {/* Current image layer - on top initially */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 2,
              transform: [{ translateX: currentImageTranslateX }],
            }}
          >
            <Image
              source={{ uri: currentImage.file }}
              style={{
                width: imageDimensions.width,
                height: imageDimensions.height,
                resizeMode: 'cover',
              }}
            />
          </Animated.View>

          {/* Next image layer - beneath current, slides in */}
          {nextImage && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1,
                transform: [{ translateX: nextImageTranslateX }],
              }}
            >
              <Image
                source={{ uri: nextImage.file }}
                style={{
                  width: imageDimensions.width,
                  height: imageDimensions.height,
                  resizeMode: 'cover',
                }}
              />
            </Animated.View>
          )}
        </View>
      </PanGestureHandler>
    </View>
  );
}
