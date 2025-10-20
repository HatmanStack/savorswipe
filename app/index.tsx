import 'react-native-gesture-handler';
import React, { useRef, useMemo, useCallback } from 'react';
import { Image, View, Animated } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { useImageQueue } from '@/hooks/useImageQueue';
import { useResponsiveLayout } from '@/hooks';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

export default function HomeScreen() {
  const router = useRouter();
  const { currentRecipe } = useRecipe();

  // Use new queue hook
  const { currentImage, advanceQueue, isLoading } = useImageQueue();

  // Animation value for simple translateX
  const currentImageTranslateX = useRef(new Animated.Value(0)).current;

  const { getImageDimensions } = useResponsiveLayout();
  const imageDimensions = getImageDimensions();

  // Handle swipe gestures
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left') {
      // Swipe left: advance to next recipe
      advanceQueue();
    } else if (direction === 'right') {
      // Swipe right: navigate to recipe detail
      if (currentRecipe?.key) {
        router.push(`/recipe/${currentRecipe.key}`);
      }
    }
  }, [advanceQueue, currentRecipe?.key, router]);

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
        <Animated.View style={{ transform: [{ translateX: currentImageTranslateX }] }}>
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
    </View>
  );
}
