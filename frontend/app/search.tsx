import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { SearchInput } from '@/components/SearchInput';
import { SearchResultsList } from '@/components/SearchResultsList';
import { SearchEmptyState } from '@/components/SearchEmptyState';
import { RecentSearches } from '@/components/RecentSearches';
import { SearchService } from '@/services/SearchService';
import { SearchStorageService } from '@/services/SearchStorageService';
import { useRecipe } from '@/context/RecipeContext';
import { Recipe, RecentSearch } from '@/types';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function SearchScreen() {
  const router = useRouter();
  const { jsonData } = useRecipe();
  const iconColor = useThemeColor({}, 'icon');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipe[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // Load recent searches on mount
  useEffect(() => {
    SearchStorageService.getRecentSearches()
      .then(setRecentSearches)
      .catch(() => {
        // Storage error - still set empty array so UI doesn't break
        setRecentSearches([]);
      });
  }, []);

  // Search when query changes
  useEffect(() => {
    // Empty query: clear results and show recent searches instead
    if (query.trim() === '') {
      setResults([]);
      return;
    }

    if (!jsonData) {
      setResults([]);
      return;
    }

    const searchResults = SearchService.searchRecipes(query, jsonData);
    setResults(searchResults);

    // Save to recent searches only if results were found
    if (searchResults.length > 0) {
      SearchStorageService.addRecentSearch(query)
        .then(() => {
          // Refresh recent searches list
          return SearchStorageService.getRecentSearches();
        })
        .then(setRecentSearches)
        .catch(() => {
          // Storage error - UI continues to work, recent searches just won't update
        });
    }
  }, [query, jsonData]);

  const handleResultPress = (recipeKey: string) => {
    router.push(`/recipe/${recipeKey}`);
  };

  const handleRecentSearchSelect = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  const handleClearAll = () => {
    SearchStorageService.clearRecentSearches()
      .then(() => {
        setRecentSearches([]);
      })
      .catch(() => {
        // Storage error - non-critical
      });
  };

  const handleSuggestionPress = (suggestion: string) => {
    setQuery(suggestion);
  };

  // Show loading state if jsonData is not loaded yet
  if (!jsonData) {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading recipes...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Platform.OS === 'web' && (
        <Head>
          <title>Search Recipes - SavorSwipe</title>
          <meta name="description" content="Search through hundreds of recipes by name or ingredients. Find exactly what you're craving on SavorSwipe." />
          <link rel="canonical" href="https://savorswipe.hatstack.fun/search" />
        </Head>
      )}
      <ThemedView style={styles.content}>
        {/* Header with close button */}
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/')} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={iconColor} />
          </Pressable>
        </View>

        {/* Search Input */}
        <View style={styles.searchInputContainer}>
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes..."
            autoFocus={true}
          />
        </View>

        {/* Conditional rendering based on state */}
        {query === '' && recentSearches.length > 0 && (
          <RecentSearches
            searches={recentSearches}
            onSearchSelect={handleRecentSearchSelect}
            onClearAll={handleClearAll}
          />
        )}

        {query !== '' && results.length > 0 && (
          <View style={styles.resultsContainer}>
            <ThemedText style={styles.resultCount}>
              Found {results.length} {results.length === 1 ? 'recipe' : 'recipes'}
            </ThemedText>
            <SearchResultsList
              results={results}
              onResultPress={handleResultPress}
            />
          </View>
        )}

        {query !== '' && results.length === 0 && (
          <SearchEmptyState
            query={query}
            onSuggestionPress={handleSuggestionPress}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButton: {
    padding: 8,
  },
  searchInputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  resultsContainer: {
    flex: 1,
  },
  resultCount: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
  },
});
