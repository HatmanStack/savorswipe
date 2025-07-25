import React, {useState, useEffect, useRef} from 'react';
import { Dimensions, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { ThemedView } from '@/components/ThemedView';
import { RecipeService, ImageService } from '@/services';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import RecipeDetails from '@/components/Recipe';
import { ThemedText } from '@/components/ThemedText';
import { useGlobalSearchParams} from 'expo-router';
const holderImg = require('@/assets/images/skillet.png')

export default function RecipeDetail() {
  const { currentRecipe, setCurrentRecipe, setFirstFile, firstFile, setJsonData, jsonData } = useRecipe();
  const [screenDimensions, setScreenDimensions] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  const [recipeExists, setRecipeExists] = useState(true);
  const buttonSrc = require('@/assets/images/home_bg.png');
  const router = useRouter();
  const glob = useGlobalSearchParams();
  
  // Check if this is a valid instance - but don't return early
  const hasValidId = glob.id && glob.id !== 'undefined' && glob.id !== '' && typeof glob.id === 'string';
  

  useEffect(() => {
    const handleResize = () => {
      setScreenDimensions({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
    };

    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => {
      subscription?.remove();
    };
  }, []);
  

  useEffect(() => {
    // Only run if we have a valid recipe ID
    if (!hasValidId) {
      return;
    }

    const recipeId = glob.id as string;

    // Only run this effect if we don't have currentRecipe or if the recipe ID doesn't match
    if (!currentRecipe || currentRecipe.key !== recipeId) {
      const fetchData = async () => {
        try {
          
          // Use existing jsonData if available, otherwise fetch it
          let recipeData = jsonData;
          if (!recipeData) {
            recipeData = await RecipeService.getRecipesFromS3();
            setJsonData(recipeData);
          } else {
          }
          
          if (!recipeData[recipeId]) {
            setRecipeExists(false);
            return;
          }
          
          setCurrentRecipe({ ...recipeData[recipeId], key: recipeId });
          
          try {
            const recipeFilePath = ImageService.getImageFileName(recipeId);
            const fileURL = await ImageService.getImageFromS3(recipeFilePath);
            
            setFirstFile({ 
              filename: recipeFilePath, 
              file: fileURL 
            });
          } catch (error) {
          }
        } catch (error) {
        }
      };
      
      fetchData();
    } else {
    }
  }, [glob.id, hasValidId]);

  return (
    <>
      <Pressable
        style={{ position: 'absolute', top: 80, left: 20, zIndex: 1 }}
        onPress={() => router.push('/')}
      >
        <Image source={buttonSrc} style={{ width: 50, height: 50 }} />
      </Pressable>
      
      {!recipeExists ? (
        <ThemedView style={{ padding: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Image 
            source={holderImg} 
            style={{ width: 100, height: 100, marginBottom: 20 }} 
          />
          <ThemedText style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
            Recipe Not Found
          </ThemedText>
          <ThemedText style={{ textAlign: 'center', marginBottom: 20 }}>
            The recipe you're looking for doesn't exist or is no longer available.
          </ThemedText>
        </ThemedView>
      ) : (
        <ParallaxScrollView
          headerBackgroundColor={{ light: "#bfaeba", dark: "#60465a" }}
          headerImage={
            <Image
              source={firstFile ? { uri: firstFile.file } : holderImg} 
              style={{
                width: screenDimensions.width > 1000 ? 1000 : screenDimensions.width,
                height: screenDimensions.height > 700 ? 700 : screenDimensions.height,
                alignSelf: 'center',
                resizeMode: 'cover',
              }}
            />
          }
          headerText={<></>} 
        >
          <ThemedView style={{ width: screenDimensions.width, height: screenDimensions.height }}>
            {currentRecipe && (
              <RecipeDetails currentRecipe={currentRecipe}/>
            )}
          </ThemedView>
        </ParallaxScrollView>
      )}
    </>
  );
}