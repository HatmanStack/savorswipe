import { StyleSheet, ScrollView, Dimensions } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Collapsible } from '@/components/Collapsible';
import { useRecipe } from '@/context/RecipeContext';

export default function TabTwoScreen() {
  type Recipe = {
    Title: string;
    Description: string | string[];
    Ingredients: string | string[];
    Directions: string | string[];
  };
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const { currentRecipe } = useRecipe() as { currentRecipe: Recipe | null | string };

  return (
    <ThemedView style={{ width: screenWidth, height: screenHeight }}>
      <ScrollView style={styles.scrollview}>
        {typeof currentRecipe !== 'string' && currentRecipe ? (
          <ThemedView style={styles.title}>

            <ThemedText type="title" style={styles.title}>{currentRecipe.Title}</ThemedText>
            {currentRecipe.Description && (
              <Collapsible title="Description">
                {Array.isArray(currentRecipe.Description) ? (
                  currentRecipe.Description.map((item, index) => (
                    <ThemedText key={index}>{item}</ThemedText>
                  ))
                ) : (
                  <ThemedText>{currentRecipe.Description}</ThemedText>
                )}
              </Collapsible>
            )}
            {typeof currentRecipe.Ingredients === 'object' && !Array.isArray(currentRecipe.Ingredients) ? (
              <Collapsible title="Ingredients" >
                {Object.entries(currentRecipe.Ingredients).map(([key, value], index) => (
                  <Collapsible key={index} title={key}>
                    {Array.isArray(value) ? (
                      value.map((item, itemIndex) => (
                        <ThemedText key={itemIndex}>{item}</ThemedText>
                      ))
                    ) : (
                      <ThemedText>{value as React.ReactNode}</ThemedText>
                    )}
                  </Collapsible>
                ))}
              </Collapsible>
            ) : (
              <Collapsible title="Ingredients" >
                {Array.isArray(currentRecipe.Ingredients) ? (
                  currentRecipe.Ingredients.map((item, index) => (
                    <ThemedText key={index}>{item}</ThemedText>
                  ))
                ) : (
                  <ThemedText>{currentRecipe.Ingredients}</ThemedText>
                )}
              </Collapsible>
            )}

            {typeof currentRecipe.Directions === 'object' && !Array.isArray(currentRecipe.Directions) ? (
              Object.entries(currentRecipe.Directions).map(([key, value], index) => (
                <Collapsible key={index} title={key}>
                  {Array.isArray(value) ? (
                    value.map((item, itemIndex) => (
                      <ThemedText key={itemIndex}>{item}</ThemedText>
                    ))
                  ) : (
                    <ThemedText>{value as React.ReactNode}</ThemedText>
                  )}
                </Collapsible>
              ))
            ) : (
              <Collapsible title="Directions">
                {Array.isArray(currentRecipe.Directions) ? (
                  currentRecipe.Directions.map((item, index) => (
                    <ThemedText key={index}>{item}</ThemedText>
                  ))
                ) : (
                  <ThemedText>{currentRecipe.Directions}</ThemedText>
                )}
              </Collapsible>
            )}
          </ThemedView>
        ) : (
          <ThemedView>
            <ThemedText>Swipe Right on an Image</ThemedText>
          </ThemedView>
        )}

      </ScrollView>
    </ThemedView>
  );
}


const styles = StyleSheet.create({
  scrollview: {
    padding: 50
  },
  title: {
    marginBottom: 50 // Adjust height as needed
  },
});



