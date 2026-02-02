import React from 'react';
import { StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Collapsible } from '@/components/Collapsible';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Recipe } from '@/types';

const windowWidth = Dimensions.get('window').width;

// Filter out internal discriminant fields from normalized types
const filterInternalKeys = ([key]: [string, unknown]) => !['kind', 'value', 'items', 'ingredients', 'steps', 'sections'].includes(key);

function RecipeDetails({ currentRecipe }: { currentRecipe: Recipe | null }) {
  if (!currentRecipe) {
    return null; // or a fallback UI
  }

  function decodeUnicode(str: string): string {
    return str.replace(/\\u[\dA-F]{4}/gi, function (match) {
      return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
    });
  }

  // Extract actual ingredient data from potentially normalized format
  function getIngredientEntries(ing: NonNullable<Recipe['Ingredients']>): [string, unknown][] {
    if (typeof ing !== 'object' || Array.isArray(ing)) return [];
    // If normalized 'flat' format, use the nested 'ingredients' field
    if ('kind' in ing && ing.kind === 'flat' && 'ingredients' in ing) {
      return Object.entries((ing as { ingredients: Record<string, string> }).ingredients);
    }
    // If normalized 'sectioned' format, use the nested 'sections' field
    if ('kind' in ing && ing.kind === 'sectioned' && 'sections' in ing) {
      return Object.entries((ing as { sections: Record<string, Record<string, string>> }).sections);
    }
    // Raw format - filter out any 'kind' key that might have leaked in
    return Object.entries(ing).filter(filterInternalKeys);
  }

  // Extract actual direction data from potentially normalized format
  function getDirectionEntries(dir: NonNullable<Recipe['Directions']>): [string, unknown][] {
    if (typeof dir !== 'object' || Array.isArray(dir)) return [];
    // If normalized 'flat' format, use the nested 'steps' field
    if ('kind' in dir && dir.kind === 'flat' && 'steps' in dir) {
      return Object.entries((dir as { steps: Record<string, string> }).steps);
    }
    // If normalized 'sectioned' format, use the nested 'sections' field
    if ('kind' in dir && dir.kind === 'sectioned' && 'sections' in dir) {
      return Object.entries((dir as { sections: Record<string, Record<string, string>> }).sections);
    }
    // Raw format - filter out any 'kind' key that might have leaked in
    return Object.entries(dir).filter(filterInternalKeys);
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
    {getIngredientEntries(currentRecipe.Ingredients).map(([key, value], index) => {
      // Check if this value is an object (nested section) or a string (flat ingredient)
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Handle nested section
        return (
          <Collapsible key={index} title={decodeUnicode(key)}>
            {Object.entries(value as Record<string, string>).map(([ingredient, amount], ingredientIndex) => (
              <ThemedText key={ingredientIndex}>
                {decodeUnicode(ingredient)}: {amount ? decodeUnicode(amount) : ''}
              </ThemedText>
            ))}
          </Collapsible>
        );
      } else {
        // Handle flat ingredient
        return (
          <ThemedText key={index}>
            {decodeUnicode(key)}: {value ? decodeUnicode(value as string) : ''}
          </ThemedText>
        );
      }
    })}
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
    {getDirectionEntries(currentRecipe.Directions)
      .sort((a, b) => {
        // Try to sort numerically if the keys are numbers
        const numA = parseInt(a[0]);
        const numB = parseInt(b[0]);
        return isNaN(numA) || isNaN(numB) ? a[0].localeCompare(b[0]) : numA - numB;
      })
      .map(([key, value], index) => {
        // Check if this value is an object (nested section) or a string (flat step)
        if (typeof value === 'object' && !Array.isArray(value)) {
          // Handle nested section
          return (
            <Collapsible key={index} title={decodeUnicode(key)}>
              {Object.entries(value as Record<string, string>)
                .sort((a, b) => {
                  const numA = parseInt(a[0]);
                  const numB = parseInt(b[0]);
                  return isNaN(numA) || isNaN(numB) ? a[0].localeCompare(b[0]) : numA - numB;
                })
                .map(([stepNum, instruction], stepIndex) => (
                  <ThemedText key={stepIndex}>
                    {stepNum}. {decodeUnicode(instruction)}
                  </ThemedText>
                ))}
            </Collapsible>
          );
        } else if (Array.isArray(value)) {
          // Handle array of steps
          return (
            <Collapsible key={index} title={decodeUnicode(key)}>
              {value.map((item, itemIndex) => (
                <ThemedText key={itemIndex}>{decodeUnicode(item)}</ThemedText>
              ))}
            </Collapsible>
          );
        } else {
          // Handle flat step
          return (
            <ThemedText key={index}>
              {key}. {decodeUnicode(value as string)}
            </ThemedText>
          );
        }
      })}
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
    marginTop: 0,
    marginBottom: 50, // Adjust height as needed
  },
});

export default RecipeDetails;
