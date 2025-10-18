import React from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { RecentSearch } from '@/types';
import { useThemeColor } from '@/hooks/useThemeColor';

interface RecentSearchesProps {
  searches: RecentSearch[];
  onSearchSelect: (query: string) => void;
  onClearAll: () => void;
}

export function RecentSearches({ searches, onSearchSelect, onClearAll }: RecentSearchesProps) {
  const iconColor = useThemeColor({ light: '#666', dark: '#999' }, 'icon');
  const borderColor = useThemeColor({ light: '#E0E0E0', dark: '#333' }, 'border');
  const itemBgColor = useThemeColor({ light: '#F5F5F5', dark: '#2A2A2A' }, 'background');

  // Don't render if no searches
  if (searches.length === 0) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header with Clear All button */}
      <View style={styles.header}>
        <ThemedText style={styles.headerText}>Recent Searches</ThemedText>
        <Pressable onPress={onClearAll}>
          <ThemedText style={styles.clearAllText}>Clear All</ThemedText>
        </Pressable>
      </View>

      {/* List of recent searches (max 10) */}
      {searches.slice(0, 10).map((search) => (
        <Pressable
          key={search.timestamp}
          onPress={() => onSearchSelect(search.query)}
          style={[styles.searchItem, { backgroundColor: itemBgColor, borderBottomColor: borderColor }]}
        >
          <Ionicons name="search" size={18} color={iconColor} style={styles.searchIcon} />
          <ThemedText style={styles.searchText}>{search.query}</ThemedText>
        </Pressable>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  clearAllText: {
    fontSize: 14,
    color: '#0a7ea4',
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchText: {
    fontSize: 16,
    flex: 1,
  },
});
