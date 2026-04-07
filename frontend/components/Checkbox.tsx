import React from 'react';
import { Pressable, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  borderColor?: string;
  fillColor?: string;
  checkColor?: string;
  style?: StyleProp<ViewStyle>;
  label?: string;
  labelStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

const createCheckbox = (defaultOptions?: Partial<CheckboxProps>) => {
  return function CustomCheckbox(props: CheckboxProps) {
    const options = { ...defaultOptions, ...props };
    const {
      checked,
      onToggle,
      size = 20,
      borderColor = '#555',
      fillColor = '#4630EB',
      checkColor = 'white',
      style,
      label,
      labelStyle,
      disabled = false,
    } = options;

    const containerStyle = [
      {
        width: size,
        height: size,
        borderWidth: Math.max(1, size / 10),
        borderColor: disabled ? '#ccc' : borderColor,
        borderRadius: size / 5,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        backgroundColor: checked ? (disabled ? '#aaa' : fillColor) : 'transparent',
      },
      style,
    ];

    const checkStyle = {
      width: size * 0.6,
      height: size * 0.6,
      backgroundColor: checkColor,
    };

    return (
      <Pressable 
        style={styles.row}
        onPress={disabled ? undefined : onToggle}
        disabled={disabled}
      >
        <View style={containerStyle}>
          {checked && <View style={checkStyle} />}
        </View>
        {label && (
          <ThemedText style={[styles.label, { marginLeft: size / 2 }, labelStyle]}>
            {label}
          </ThemedText>
        )}
      </Pressable>
    );
  };
};

// Create some preset checkbox styles
export const StandardCheckbox = createCheckbox();

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  label: {
    fontSize: 16,
  },
});