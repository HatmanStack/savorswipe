import React, {useState, useEffect} from 'react';
import { Dimensions, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { ThemedView } from '@/components/ThemedView';
import { getJsonFromS3, fetchFromS3 } from '@/components/GetImages';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import RecipeDetails from '@/components/Recipe';
import { ThemedText } from '@/components/ThemedText';
import { useGlobalSearchParams} from 'expo-router';
const holderImg = require('@/assets/images/skillet.png')

export default function RecipeDetail() {
  const { currentRecipe, setCurrentRecipe, setFirstFile, firstFile, setJsonData, jsonData } = useRecipe();
  const [screenDimensions, setScreenDimensions] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  const buttonSrc = require('@/assets/images/home_bg.png');
  const router = useRouter();
  const glob = useGlobalSearchParams();
  const [recipeExists, setRecipeExists] = useState(true);
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
    // Only run this effect if we don't have currentRecipe
    if (!currentRecipe) {
      const fetchData = async () => {
        try {
          const tempJsonData = await getJsonFromS3();
          const recipeFilePath = `images/${glob.id}.jpg`;
          
          if (!tempJsonData[glob.id]) {
            console.log('Recipe not found:', glob.id);
            setRecipeExists(false);
            return; // Exit early if recipe doesn't exist
          }
          
          setJsonData(tempJsonData);
          setCurrentRecipe(tempJsonData[glob.id]);
          
          try {
            const fileURL = await fetchFromS3(recipeFilePath);
            
            setFirstFile({ 
              filename: recipeFilePath, 
              file: fileURL 
            });
          } catch (error) {
            console.error('Error fetching image:', error);
          }
        } catch (error) {
          console.error('Error loading data:', error);
        }
      };
      
      fetchData();
    }
  }, [currentRecipe, glob]);

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
              <RecipeDetails currentRecipe={jsonData[currentRecipe.key]}/>
            )}
          </ThemedView>
        </ParallaxScrollView>
      )}
    </>
  );
}