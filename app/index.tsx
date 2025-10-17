import 'react-native-gesture-handler';
import React, { useState, useRef, useEffect } from 'react';
import { Image, View, Animated } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import GetImages from '@/components/GetImages';
import { useResponsiveLayout } from '@/hooks';
import { ImageDimensions } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

export default function HomeScreen() {
  const [fetchImage, setFetchImage] = useState(false);
  const [getNewList, setGetNewList] = useState(false);
  const { firstFile, allFiles, setStartImage, currentRecipe, setCurrentRecipe, jsonData } = useRecipe();
  const translateX = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  
  const { getImageDimensions } = useResponsiveLayout();

  // Set current recipe when firstFile changes (original logic)
  useEffect(() => {  
    if (firstFile && jsonData) {
      const recipeId = firstFile.filename.split('/').pop()?.split('.')[0];
      
      if (recipeId && jsonData[recipeId]) {
        // Only set if it's different to prevent loops
        if (!currentRecipe || currentRecipe.key !== recipeId) {
          setCurrentRecipe({ ...jsonData[recipeId], key: recipeId });
        }
      }
    }     
  }, [firstFile, jsonData]);

  const handleSwipeGesture = (direction: 'left' | 'right') => {
    
    // Manage image queue based on remaining files
    if (allFiles.length < 3) {
      setGetNewList(prev => !prev); 
    }
    if (allFiles.length > 40) {
      setGetNewList(false);
    }

    if (direction === 'left') {
      setStartImage(null);
      setFetchImage(prev => !prev);
    } else if (direction === 'right') {
      if (currentRecipe?.key) {
        const url = `/recipe/${currentRecipe.key}`;
        router.push(url);
      }
    }
  };

  // Debounce function to prevent rapid swipes
  const debounce = (func: (...args: unknown[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: unknown[]) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const debouncedHandleSwipe = debounce(handleSwipeGesture, 100);

  const imageDimensions = getImageDimensions();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleImageDimensions = (_dims: ImageDimensions) => {}; // Accept but ignore dimensions

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <GetImages
        getNewList={getNewList}
        fetchImage={fetchImage}
        setFetchImage={setFetchImage}
        setImageDimensions={handleImageDimensions}
      />
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
        <Animated.View style={{ transform: [{ translateX }] }}>
          <Image
            source={firstFile ? { uri: firstFile.file } : holderImg} 
            style={{
              width: firstFile ? imageDimensions.width : 200,
              height: firstFile ? imageDimensions.height : 200,
              alignSelf: 'center',
              resizeMode: 'cover',
            }}
          />
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}