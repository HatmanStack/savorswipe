import React, { useState } from 'react';
import { StyleSheet, Pressable, Image } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Recipe } from '@/types';
import { ImageService } from '@/services/ImageService';
import { useThemeColor } from '@/hooks/useThemeColor';
import fallbackImage from '@/assets/images/adaptive-icon.png';

interface SearchResultItemProps {
  recipe: Recipe;
  onPress: () => void;
}

export function SearchResultItem({ recipe, onPress }: SearchResultItemProps) {
  const [imageError, setImageError] = useState(false);
  const borderColor = useThemeColor({ light: '#E0E0E0', dark: '#333' }, 'icon');
  const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

  // Construct image URL with validation
  let imageUrl = '';
  if (!CLOUDFRONT_BASE_URL) {

  } else {
    imageUrl = `${CLOUDFRONT_BASE_URL}/${ImageService.getImageFileName(recipe.key)}`;
  }

  // Extract brief info from description or ingredients
  const getBriefInfo = (): string => {
    // Try description first
    if (recipe.Description) {
      if (typeof recipe.Description === 'string') {
        return recipe.Description;
      }
      if (Array.isArray(recipe.Description)) {
        return recipe.Description.slice(0, 2).join('. ');
      }
    }

    // Fall back to ingredients
    if (recipe.Ingredients) {
      if (typeof recipe.Ingredients === 'string') {
        return recipe.Ingredients.split(',').slice(0, 3).join(', ');
      }
      if (Array.isArray(recipe.Ingredients)) {
        return recipe.Ingredients.slice(0, 3).join(', ');
      }
      if (typeof recipe.Ingredients === 'object') {
        const items = Object.entries(recipe.Ingredients)
          .slice(0, 3)
          .map(([key]) => key);
        return items.join(', ');
      }
    }

    return 'No description available';
  };

  return (
    <Pressable onPress={onPress}>
      <ThemedView style={[styles.container, { borderBottomColor: borderColor }]}>
        <Image
          source={imageError || !imageUrl ? fallbackImage : { uri: imageUrl }}
          style={styles.image}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />

        <ThemedView style={styles.textContainer}>
          <ThemedText style={styles.title} numberOfLines={2}>
            {recipe.Title}
          </ThemedText>
          <ThemedText style={styles.info} numberOfLines={2}>
            {getBriefInfo()}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  info: {
    fontSize: 14,
    opacity: 0.7,
  },
});
