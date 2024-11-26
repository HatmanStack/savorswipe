import React from 'react';
import { StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Collapsible } from '@/components/Collapsible';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText'; // Adjust the import path as needed

type Recipe = {
  Title: string;
  Description?: string | string[];
  Ingredients?: string | string[] | Record<string, string | string[]>;
  Directions?: string | string[] | Record<string, string | string[]>;
};

function RecipeDetails({ currentRecipe }: { currentRecipe: Recipe }) {
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
            {Object.entries(currentRecipe.Ingredients).map(([key, value], index) => (
              <Collapsible key={index} title={decodeUnicode(key)}>
                {Array.isArray(value) ? (
                  value.map((item, itemIndex) => (
                    <ThemedText key={itemIndex}>{decodeUnicode(item)}</ThemedText>
                  ))
                ) : (
                  <ThemedText>{decodeUnicode(value as string)}</ThemedText>
                )}
              </Collapsible>
            ))}
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
            {Object.entries(currentRecipe.Directions).map(([key, value], index) => (
              <Collapsible key={index} title={decodeUnicode(key)}>
                {Array.isArray(value) ? (
                  value.map((item, itemIndex) => (
                    <ThemedText key={itemIndex}>{decodeUnicode(item)}</ThemedText>
                  ))
                ) : (
                  <ThemedText>{decodeUnicode(value as string)}</ThemedText>
                )}
              </Collapsible>
            ))}
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
    padding: 50,
    marginRight: 50,
  },
  title: {
    marginTop:20,
    marginBottom: 50, // Adjust height as needed
  },
});

export default RecipeDetails;