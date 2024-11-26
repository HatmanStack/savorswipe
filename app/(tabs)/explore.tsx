import { StyleSheet, Dimensions } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRecipe } from '@/context/RecipeContext';
import  RecipeDetails  from '@/components/Recipe';

export default function TabTwoScreen() {
 
  type Recipe = {
    Title: string;
    Description: string | string[];
    Ingredients: string | string[];
    Directions: string | string[];
  };
  
  const { currentRecipe } = useRecipe() as { currentRecipe: Recipe | null | string };
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  return (
    <ThemedView style={{ width: screenWidth, height: screenHeight }}>
      
        {currentRecipe && typeof currentRecipe === 'object' ? (
          <RecipeDetails currentRecipe={currentRecipe} />
        ) : (
          <ThemedView style={styles.centeredView}>
            <ThemedText style={styles.themedText} >Swipe Right on an Image</ThemedText>
          </ThemedView>
        )}   
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  themedText: {
    padding: 50,
    textAlign: 'center', 
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center', 
  },
});




