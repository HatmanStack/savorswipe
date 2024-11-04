import { StyleSheet, Image,  } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useRecipe } from '@/context/RecipeContext';

// Start of Selection
export default function TabTwoScreen() {
  const { currentRecipe } = useRecipe();

  return (
    <ThemedView>
      {currentRecipe ? (
        <ThemedText>{currentRecipe}</ThemedText>
      ) : (
        <ThemedText>No recipe selected</ThemedText>
      )}
    </ThemedView>
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

  

