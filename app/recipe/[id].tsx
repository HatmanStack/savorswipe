import React, {useState, useEffect} from 'react';
import { Dimensions, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipe } from '@/context/RecipeContext';
import { ThemedView } from '@/components/ThemedView';
import { RecipeService, ImageService, IngredientScalingService } from '@/services';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import RecipeDetails from '@/components/Recipe';
import { ThemedText } from '@/components/ThemedText';
import { ServingSizeControl } from '@/components/ServingSizeControl';
import { useGlobalSearchParams} from 'expo-router';
import type { Recipe } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const holderImg = require('@/assets/images/skillet.png');

export default function RecipeDetail() {
  const { currentRecipe, setCurrentRecipe, setJsonData, jsonData } = useRecipe();
  const [screenDimensions, setScreenDimensions] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  const [recipeExists, setRecipeExists] = useState(true);
  const [recipeImage, setRecipeImage] = useState<{ filename: string; file: string } | null>(null);
  const [currentServings, setCurrentServings] = useState<number>(4);
  const [scaledRecipe, setScaledRecipe] = useState<Recipe | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // Scale recipe when currentRecipe or currentServings changes
  useEffect(() => {
    if (currentRecipe) {
      const scaled = IngredientScalingService.scaleRecipeIngredients(
        currentRecipe,
        currentServings
      );
      setScaledRecipe(scaled);
    } else {
      // Clear scaled recipe when currentRecipe is cleared to avoid stale data
      setScaledRecipe(null);
    }
  }, [currentRecipe, currentServings]);

  // Handle serving size change
  const handleServingsChange = (newServings: number) => {
    setCurrentServings(newServings);
  };


  useEffect(() => {
    // Only run if we have a valid recipe ID
    if (!hasValidId) {
      return;
    }

    const recipeId = glob.id as string;

    // Reset recipe image when navigating to a different recipe
    if (currentRecipe && currentRecipe.key !== recipeId) {
      setRecipeImage(null);
    }

    // Only run this effect if we don't have currentRecipe, recipe ID doesn't match, or we don't have the image
    if (!currentRecipe || currentRecipe.key !== recipeId || !recipeImage) {
      const fetchData = async () => {
        try {

          // Use existing jsonData if available, otherwise fetch it
          let recipeData = jsonData;
          if (!recipeData) {
            recipeData = await RecipeService.getRecipesFromS3();
            setJsonData(recipeData);
          }

          if (!recipeData[recipeId]) {
            setRecipeExists(false);
            return;
          }

          const recipe = { ...recipeData[recipeId], key: recipeId };
          setCurrentRecipe(recipe);

          // Initialize serving size from recipe data
          const originalServings = recipe.Servings ?? 4;
          setCurrentServings(originalServings);

          try {
            const recipeFilePath = ImageService.getImageFileName(recipeId);
            const fileURL = await ImageService.getImageFromS3(recipeFilePath);

            setRecipeImage({
              filename: recipeFilePath,
              file: fileURL
            });
          } catch (error) {
            console.error(`Failed to load image for recipe ${recipeId}:`, error);
          }
        } catch (error) {
          console.error(`Failed to load recipe data for recipe ${recipeId}:`, error);
        }
      };

      fetchData();
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
            The recipe you&apos;re looking for doesn&apos;t exist or is no longer available.
          </ThemedText>
        </ThemedView>
      ) : (
        <ParallaxScrollView
          headerBackgroundColor={{ light: "#bfaeba", dark: "#60465a" }}
          headerImage={
            <Image
              source={recipeImage ? { uri: recipeImage.file } : holderImg}
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
            {scaledRecipe && (
              <>
                <RecipeDetails currentRecipe={scaledRecipe}/>
                <ServingSizeControl
                  currentServings={currentServings}
                  onServingsChange={handleServingsChange}
                />
              </>
            )}
          </ThemedView>
        </ParallaxScrollView>
      )}
    </>
  );
}