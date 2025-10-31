import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

interface NewRecipeBannerProps {
  visible: boolean;
  testID?: string;
}

/**
 * Corner ribbon banner for new recipe indicator.
 * Displays "NEW" text in top-right corner for recently uploaded recipes.
 */
export default function NewRecipeBanner({ visible, testID }: NewRecipeBannerProps) {
  const backgroundColor = useThemeColor({ light: '#fff', dark: '#333' }, 'background');

  if (!visible) {
    return null;
  }

  return (
    <View
      style={[styles.container, { backgroundColor }]}
      testID={testID}
      accessibilityLabel="New recipe"
      accessibilityRole="text"
    >
      <Text style={styles.text}>NEW</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    right: 16,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 10,
    zIndex: 10,
  },
  text: {
    color: '#DD9236',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
