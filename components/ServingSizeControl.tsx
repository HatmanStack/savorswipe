import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';

interface ServingSizeControlProps {
  currentServings: number;
  onServingsChange: (servings: number) => void;
}

/**
 * Floating badge control for adjusting recipe serving size.
 * Appears collapsed as an icon, expands to show +/- controls.
 */
export function ServingSizeControl({
  currentServings,
  onServingsChange,
}: ServingSizeControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({ light: '#fff', dark: '#333' }, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const buttonColor = '#DD9236'; // Match home/hamburger button color
  const disabledColor = useThemeColor({ light: '#ccc', dark: '#555' }, 'icon');

  const handleIncrement = () => {
    onServingsChange(currentServings + 1);
  };

  const handleDecrement = () => {
    if (currentServings > 1) {
      onServingsChange(currentServings - 1);
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Use different container based on expanded state to avoid nested buttons
  const ContainerComponent = isExpanded ? View : Pressable;
  const containerProps = isExpanded
    ? {
        testID: 'serving-size-badge',
        style: [
          styles.container,
          styles.expanded,
          { backgroundColor },
        ],
      }
    : {
        testID: 'serving-size-badge',
        onPress: toggleExpanded,
        accessibilityLabel: 'Adjust serving size',
        accessibilityHint: 'Double tap to show serving size adjustment controls',
        accessibilityRole: 'button' as const,
        style: [
          styles.container,
          styles.collapsed,
          { backgroundColor },
        ],
      };

  return (
    <ContainerComponent {...containerProps}>
      {isExpanded ? (
        <View
          style={styles.controlsContainer}
          accessible={false} // Let child buttons be individually accessible
        >
          <Pressable
            testID="decrement-button"
            onPress={handleDecrement}
            accessibilityLabel="Decrease servings"
            accessibilityHint={`Decrease from ${currentServings} servings`}
            accessibilityRole="button"
            accessibilityState={{ disabled: currentServings <= 1 }}
            style={[
              styles.button,
              { backgroundColor: currentServings <= 1 ? disabledColor : buttonColor },
            ]}
            disabled={currentServings <= 1}
          >
            <Text style={styles.buttonText}>−</Text>
          </Pressable>

          <Text
            style={[
              styles.servingsText,
              { color: textColor },
            ]}
            accessibilityLabel={`${currentServings} servings`}
            accessibilityRole="text"
          >
            {currentServings}
          </Text>

          <Pressable
            testID="increment-button"
            onPress={handleIncrement}
            accessibilityLabel="Increase servings"
            accessibilityHint={`Increase from ${currentServings} servings`}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: buttonColor }]}
          >
            <Text style={styles.buttonText}>+</Text>
          </Pressable>

          {/* Collapse button when expanded */}
          <Pressable
            testID="collapse-button"
            onPress={toggleExpanded}
            accessibilityLabel="Collapse serving size control"
            accessibilityHint="Double tap to hide controls"
            accessibilityRole="button"
            style={styles.collapseButton}
          >
            <Ionicons name="close" size={20} color={iconColor} />
          </Pressable>
        </View>
      ) : (
        <View testID="serving-size-icon">
          <Ionicons
            name="restaurant-outline"
            size={24}
            color={iconColor}
            accessible={false} // Icon is decorative, parent Pressable has the label
          />
        </View>
      )}
    </ContainerComponent>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -30,
    right: 48,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  collapsed: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expanded: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  servingsText: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  collapseButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
});
