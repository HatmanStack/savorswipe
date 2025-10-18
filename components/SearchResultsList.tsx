import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SearchResultItem } from '@/components/SearchResultItem';
import { Recipe } from '@/types';

interface SearchResultsListProps {
  results: Recipe[];
  onResultPress: (recipeKey: string) => void;
}

export function SearchResultsList({ results, onResultPress }: SearchResultsListProps) {
  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <SearchResultItem
          recipe={item}
          onPress={() => onResultPress(item.key)}
        />
      )}
      style={styles.list}
      removeClippedSubviews={true}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
