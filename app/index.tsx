import 'react-native-gesture-handler';
import React, { useRef, useMemo } from 'react';
import { Image, View, Animated } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { useImageQueue } from '@/hooks/useImageQueue';
import { useResponsiveLayout } from '@/hooks';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

// Shared animation duration constant
const ANIM_DURATION = 100;

export default function HomeScreen() {
  const router = useRouter();
  const { currentRecipe } = useRecipe();

  // Use new queue hook
  const { currentImage, nextImage, advanceQueue, isLoading } = useImageQueue();

  // Animation values
  const currentImageTranslateX = useRef(new Animated.Value(0)).current;
  const nextImageTranslateX = useRef(new Animated.Value(400)).current; // Start off-screen right
  const isAnimatingRef = useRef(false); // Prevent overlapping animations

  const { getImageDimensions } = useResponsiveLayout();
  const imageDimensions = getImageDimensions();

  // Handle swipe gestures
  const handleSwipe = (direction: 'left' | 'right') => {
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
  };

  // Animate slide transition
  const animateSwipe = (onComplete: () => void) => {
    // Set animating flag to prevent concurrent animations
    isAnimatingRef.current = true;

    // Run both animations in parallel for smooth transition
    Animated.parallel([
      // Slide current image out to left
      Animated.timing(currentImageTranslateX, {
        toValue: -400,
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

      // Reset animation values for next swipe
      currentImageTranslateX.setValue(0);
      nextImageTranslateX.setValue(400);

      // Reset animating flag
      isAnimatingRef.current = false;
    });
  };

  // Debounce function (keep existing)
  const debounce = (func: (...args: unknown[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: unknown[]) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  // Memoize debounced handler for stable instance
  const debouncedHandleSwipe = useMemo(() => debounce(handleSwipe, 100), []);

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
