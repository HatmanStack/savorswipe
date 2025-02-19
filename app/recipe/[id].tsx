import React, {useState, useEffect} from 'react';
import { Dimensions, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import RecipeDetails from '@/components/Recipe';
const holderImg = require('@/assets/images/skillet.png')

export default function RecipeDetail() {
  const { currentRecipe, firstFile, jsonData } = useRecipe();
  const [screenDimensions, setScreenDimensions] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  const buttonSrc = require('@/assets/images/home.png');
  const router = useRouter();
  useEffect(() => {
    const handleResize = () => {
      setScreenDimensions({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
    };

    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <>
    <Pressable
                style={{ position: 'absolute', top: 80, left: 20, zIndex: 1 }}
                onPress={() => router.push('/')}
            >
                <Image source={buttonSrc} style={{ width: 50, height: 50 }} />
            </Pressable>
    <ParallaxScrollView
    headerBackgroundColor={{ light: "#bfaeba", dark: "#60465a" }}
    headerImage={
      <Image
              source={firstFile ? { uri: firstFile.file } : holderImg} 
              style={{
                width: screenDimensions.width > 1000 ?  1000 : 200,
                height: screenDimensions.height > 700 ?  700 : 200,
                alignSelf: 'center',
                resizeMode: 'cover',
              }}
            />
    }
    headerText={<></>} 
    >
    <ThemedView style={{ width: screenDimensions.width, height: screenDimensions.height }}>
      
    {currentRecipe && (
  <>
    <RecipeDetails currentRecipe={jsonData[currentRecipe.key]}></RecipeDetails>
  </>
)}
    </ThemedView>
    </ParallaxScrollView>
    </>
  );
}