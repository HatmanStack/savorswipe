import React, {useState, useEffect} from 'react';
import { Linking, Dimensions, Image } from 'react-native';
import { getJsonFromS3, fetchFromS3 } from '@/components/GetImages';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import RecipeDetails from '@/components/Recipe';

export default function RecipeDetail() {
  const [id, setId] = useState<string | null>(null);
  const [recipeDetails, setRecipeDetails] = useState();
  const [recipeImage, setRecipeImage] = useState<string | undefined>();
  const [screenDimensions, setScreenDimensions] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });

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
    const handleUrl = (url: string) => {
      const urlParts = url.split('/');
      const idIndex = urlParts.indexOf('recipe') + 1;
      if (idIndex < urlParts.length) {
        setId(urlParts[idIndex]);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url);
      }
    });

    const urlListener = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      urlListener.remove();
    };
  }, []);

  useEffect(() => {
    const fetchJsonData = async () => {
      try {
        if (id !== null) {
          const jsonData = await getJsonFromS3();
          setRecipeDetails(jsonData[id]);
          const fileData = await fetchFromS3(`images/${id}.jpg`);
          if (fileData) {
            const base64String = fileData.toString('base64');
            setRecipeImage(`data:image/jpeg;base64,${base64String}`);
          } else {
            console.warn('File data is undefined');
          }
        }
      
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    if (id) {
      fetchJsonData();
    }
  }, [id]);

  return (
    <ParallaxScrollView
    headerBackgroundColor={{ light: "#bfaeba", dark: "#60465a" }}
    headerImage={
      <Image
              source={{uri: recipeImage}} 
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
      
      {recipeDetails && (
        <RecipeDetails currentRecipe={recipeDetails}></RecipeDetails>
      )}
    </ThemedView>
    </ParallaxScrollView>
  );
}