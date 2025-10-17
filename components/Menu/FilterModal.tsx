import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { StandardCheckbox } from '@/components/Checkbox';
import { ThemedText } from '@/components/ThemedText';
import { MealType } from '@/types';
import { useRecipe } from '@/context/RecipeContext';

interface FilterModalProps {
  styles: Record<string, unknown>;
}

export const FilterModal: React.FC<FilterModalProps> = ({ styles }) => {
  const [mealTypeExpanded, setMealTypeExpanded] = useState(false);
  const { mealTypeFilters, setMealTypeFilters } = useRecipe();

  const toggleMealTypeFilter = (type: MealType) => {
    if (mealTypeFilters.includes(type)) {
      const updatedFilters = mealTypeFilters.filter((t) => t !== type);
      setMealTypeFilters(updatedFilters);
    } else {
      const updatedFilters = [...mealTypeFilters, type];
      setMealTypeFilters(updatedFilters);
    }
  };

  const mealTypes: MealType[] = [
    'main dish',
    'dessert',
    'appetizer',
    'breakfast',
    'side dish',
    'beverage',
  ];

  return (
    <View style={styles.filterSection}>
      <Pressable
        style={styles.dropdownHeader}
        onPress={() => setMealTypeExpanded(!mealTypeExpanded)}
      >
        <ThemedText style={styles.sectionTitle}>Meal Type</ThemedText>
        <ThemedText style={styles.dropdownIcon}>
          {mealTypeExpanded ? '▲' : '▼'}
        </ThemedText>
      </Pressable>

      {mealTypeExpanded && (
        <View style={styles.checkboxContainer}>
          {mealTypes.map((type) => (
            <View key={type} style={styles.checkboxRow}>
              <StandardCheckbox
                checked={mealTypeFilters.includes(type)}
                onToggle={() => toggleMealTypeFilter(type)}
                label={type.charAt(0).toUpperCase() + type.slice(1)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
};