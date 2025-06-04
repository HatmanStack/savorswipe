import React from 'react';
import { StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Collapsible } from '@/components/Collapsible';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Recipe } from '@/types';

const windowWidth = Dimensions.get('window').width;

function RecipeDetails({ currentRecipe }: { currentRecipe: Recipe | null }) {
  if (!currentRecipe) {
    return null; // or a fallback UI
  } 

  function decodeUnicode(str: string): string {
    return str.replace(/\\u[\dA-F]{4}/gi, function (match) {
      return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
    });
  }
  
  return (
    <ScrollView style={styles.scrollview}>
      <ThemedView style={styles.title}>
        <ThemedText type="title" style={styles.title}>
          {decodeUnicode(currentRecipe.Title)}
        </ThemedText>
        {currentRecipe.Description && (
          <Collapsible title="Description">
            {Array.isArray(currentRecipe.Description) ? (
              currentRecipe.Description.map((item, index) => (
                <ThemedText key={index}>{decodeUnicode(item)}</ThemedText>
              ))
            ) : (
              <ThemedText>{decodeUnicode(currentRecipe.Description)}</ThemedText>
            )}
          </Collapsible>
        )}

{typeof currentRecipe.Ingredients === 'object' && !Array.isArray(currentRecipe.Ingredients) ? (
  <Collapsible title="Ingredients">
    {/* Check if the first value is an object (indicating a sectioned structure) */}
    {Object.values(currentRecipe.Ingredients)[0] && 
     typeof Object.values(currentRecipe.Ingredients)[0] === 'object' ? (
      // Handle sectioned ingredients (nested objects)
      Object.entries(currentRecipe.Ingredients).map(([sectionName, ingredients], sectionIndex) => (
        <Collapsible key={sectionIndex} title={decodeUnicode(sectionName)}>
          {typeof ingredients === 'object' && !Array.isArray(ingredients) ? (
            Object.entries(ingredients as Record<string, string>).map(([ingredient, amount], ingredientIndex) => (
              <ThemedText key={ingredientIndex}>
                {decodeUnicode(ingredient)}: {amount ? decodeUnicode(amount) : ''}
              </ThemedText>
            ))
          ) : (
            <ThemedText>{decodeUnicode(String(ingredients))}</ThemedText>
          )}
        </Collapsible>
      ))
    ) : (
      // Handle flat ingredients (direct key-value pairs)
      Object.entries(currentRecipe.Ingredients).map(([ingredient, amount], index) => (
        <ThemedText key={index}>
          {decodeUnicode(ingredient)}: {amount ? decodeUnicode(amount as string) : ''}
        </ThemedText>
      ))
    )}
  </Collapsible>
) : (
  <Collapsible title="Ingredients">
    {Array.isArray(currentRecipe.Ingredients) ? (
      currentRecipe.Ingredients.map((item, index) => (
        <ThemedText key={index}>{decodeUnicode(item)}</ThemedText>
      ))
    ) : (
      <ThemedText>{decodeUnicode(currentRecipe.Ingredients as string)}</ThemedText>
    )}
  </Collapsible>
)}

{typeof currentRecipe.Directions === 'object' && !Array.isArray(currentRecipe.Directions) ? (
  <Collapsible title="Directions">
    {/* Check if the first value is an object (indicating a sectioned structure) */}
    {Object.values(currentRecipe.Directions)[0] && 
     typeof Object.values(currentRecipe.Directions)[0] === 'object' ? (
      // Handle sectioned directions (nested objects)
      Object.entries(currentRecipe.Directions).map(([sectionName, steps], sectionIndex) => (
        <Collapsible key={sectionIndex} title={decodeUnicode(sectionName)}>
          {typeof steps === 'object' && !Array.isArray(steps) ? (
            // Handle numbered steps (like in your JSON)
            Object.entries(steps as Record<string, string>).sort((a, b) => {
              // Try to sort numerically if possible
              const numA = parseInt(a[0]);
              const numB = parseInt(b[0]);
              return isNaN(numA) || isNaN(numB) ? a[0].localeCompare(b[0]) : numA - numB;
            }).map(([stepNum, instruction], stepIndex) => (
              <ThemedText key={stepIndex}>
                {stepNum}. {decodeUnicode(instruction)}
              </ThemedText>
            ))
          ) : Array.isArray(steps) ? (
            steps.map((item, itemIndex) => (
              <ThemedText key={itemIndex}>{decodeUnicode(item)}</ThemedText>
            ))
          ) : (
            <ThemedText>{decodeUnicode(String(steps))}</ThemedText>
          )}
        </Collapsible>
      ))
    ) : (
      // Handle flat directions (direct step-instruction pairs)
      Object.entries(currentRecipe.Directions)
        .sort((a, b) => {
          const numA = parseInt(a[0]);
          const numB = parseInt(b[0]);
          return isNaN(numA) || isNaN(numB) ? a[0].localeCompare(b[0]) : numA - numB;
        })
        .map(([step, instruction], index) => (
          <ThemedText key={index}>
            {step}. {decodeUnicode(instruction as string)}
          </ThemedText>
        ))
    )}
  </Collapsible>
) : (
  <Collapsible title="Directions">
    {Array.isArray(currentRecipe.Directions) ? (
      currentRecipe.Directions.map((item, index) => (
        <ThemedText key={index}>{decodeUnicode(item)}</ThemedText>
      ))
    ) : (
      <ThemedText>{decodeUnicode(currentRecipe.Directions as string)}</ThemedText>
    )}
  </Collapsible>
)}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollview: {
    padding: windowWidth * 0.02,
    marginRight: 50,
  },
  title: {
    marginTop:20,
    marginBottom: 50, // Adjust height as needed
  },
});

export default RecipeDetails;