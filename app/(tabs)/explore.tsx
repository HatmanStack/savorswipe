import { StyleSheet, View, Text } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useRecipe } from '@/context/RecipeContext';

  
  import { useEffect, useState } from 'react';
  import { S3 } from 'aws-sdk';
  import Constants from 'expo-constants';

  export default function TabTwoScreen() {
    const { currentRecipe } = useRecipe();
    const [recipeData, setRecipeData] = useState(null);
    const s3bucket = 'savorswipe-recipe';
    const s3 = new S3({
      region: Constants.manifest.extra.AWS_REGION,
      accessKeyId: Constants.manifest.extra.AWS_ID,
      secretAccessKey: Constants.manifest.extra.AWS_SECRET
    });

    useEffect(() => {
      const fetchRecipe = async () => {
        if (currentRecipe) {
          console.log(currentRecipe);
          try {
            const params = {
              Bucket: s3bucket,
              Key: `jsondata/${currentRecipe}.json`, // Assuming the recipe is stored as a JSON file in the jsondata folder
            };
            const file = await s3.getObject(params).promise();
            if (file.Body) { // Check if file.Body is defined
              const data = JSON.parse(file.Body.toString('utf-8'));
              setRecipeData(data);
            } else {
              console.error('File body is undefined');
            }
          } catch (error) {
            console.error('Error fetching recipe from S3:', error);
          }
        }
      };

      fetchRecipe();
    }, [currentRecipe]);

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        {recipeData ? (
          <Text style={{ fontSize: 20, padding: 50 }}>{JSON.stringify(recipeData)}</Text> // Display the recipe data
        ) : (
          <ThemedText style={{ fontSize: 20, padding: 10 }}>No recipe selected</ThemedText>
        )}
      </View>
    );
  }


const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3, // For Android shadow
    shadowColor: '#000', // For iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    margin: 10,
  },
  photo: {
    width: '100%',
    height: 200, // Adjust height as needed
  },
});

  

