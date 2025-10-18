import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';

interface SearchEmptyStateProps {
  query: string;
  onSuggestionPress?: (suggestion: string) => void;
}

const POPULAR_SUGGESTIONS = [
  'chicken',
  'pasta',
  'garlic',
  'tomato',
  'cheese',
  'chocolate',
];

export function SearchEmptyState({ query, onSuggestionPress }: SearchEmptyStateProps) {
  return (
    <ThemedView style={styles.container}>
      <Ionicons name="search" size={64} color="#999" style={styles.icon} />

      <ThemedText style={styles.title}>No recipes found</ThemedText>
      <ThemedText style={styles.queryText}>for "{query}"</ThemedText>

      <View style={styles.suggestionsContainer}>
        <ThemedText style={styles.suggestionsTitle}>Suggestions:</ThemedText>
        <ThemedText style={styles.suggestionItem}>
          • Try searching for single ingredients like "chocolate"
        </ThemedText>
        <ThemedText style={styles.suggestionItem}>
          • Check your spelling
        </ThemedText>
        <ThemedText style={styles.suggestionItem}>
          • Try broader terms
        </ThemedText>
      </View>

      {onSuggestionPress && (
        <View style={styles.popularContainer}>
          <ThemedText style={styles.popularTitle}>Popular ingredients:</ThemedText>
          <View style={styles.chipsContainer}>
            {POPULAR_SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                style={styles.chip}
                onPress={() => onSuggestionPress(suggestion)}
              >
                <ThemedText style={styles.chipText}>{suggestion}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  queryText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  suggestionsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  suggestionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  suggestionItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  popularContainer: {
    width: '100%',
  },
  popularTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  chipText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '500',
  },
});
