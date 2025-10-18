import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';

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
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');
  const chipBg = useThemeColor({ light: '#E8F5E9', dark: '#1B3A1F' }, 'background');
  const chipBorder = useThemeColor({ light: '#4CAF50', dark: '#4CAF50' }, 'tint');
  const chipTextColor = useThemeColor({ light: '#2E7D32', dark: '#81C784' }, 'text');

  return (
    <ThemedView style={styles.container}>
      <Ionicons name="search" size={64} color={iconColor} style={styles.icon} />

      <ThemedText style={styles.title}>No recipes found</ThemedText>
      <ThemedText lightColor="#666" darkColor="#999" style={styles.queryText}>for "{query}"</ThemedText>

      <View style={styles.suggestionsContainer}>
        <ThemedText style={styles.suggestionsTitle}>Suggestions:</ThemedText>
        <ThemedText lightColor="#666" darkColor="#999" style={styles.suggestionItem}>
          • Try searching for single ingredients like "chocolate"
        </ThemedText>
        <ThemedText lightColor="#666" darkColor="#999" style={styles.suggestionItem}>
          • Check your spelling
        </ThemedText>
        <ThemedText lightColor="#666" darkColor="#999" style={styles.suggestionItem}>
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
                style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}
                onPress={() => onSuggestionPress(suggestion)}
              >
                <ThemedText style={[styles.chipText, { color: chipTextColor }]}>{suggestion}</ThemedText>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
