import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ServingSizeControl } from '../ServingSizeControl';

describe('ServingSizeControl', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render collapsed state by default', () => {
    const { queryByText, getByTestId } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    // Should show icon, not full control
    expect(getByTestId('serving-size-icon')).toBeTruthy();
    expect(queryByText('4')).toBeNull();
  });

  it('should expand when tapped', () => {
    const { getByTestId, getByText } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    const badge = getByTestId('serving-size-badge');
    fireEvent.press(badge);

    // Should now show full control
    expect(getByText('4')).toBeTruthy();
    expect(getByTestId('decrement-button')).toBeTruthy();
    expect(getByTestId('increment-button')).toBeTruthy();
  });

  it('should increment servings when + pressed', () => {
    const { getByTestId } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    // Expand first
    fireEvent.press(getByTestId('serving-size-badge'));

    // Press increment
    fireEvent.press(getByTestId('increment-button'));

    expect(mockOnChange).toHaveBeenCalledWith(5);
  });

  it('should decrement servings when - pressed', () => {
    const { getByTestId } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    fireEvent.press(getByTestId('serving-size-badge'));
    fireEvent.press(getByTestId('decrement-button'));

    expect(mockOnChange).toHaveBeenCalledWith(3);
  });

  it('should not go below 1 serving', () => {
    const { getByTestId } = render(
      <ServingSizeControl
        currentServings={1}
        onServingsChange={mockOnChange}
      />
    );

    fireEvent.press(getByTestId('serving-size-badge'));
    fireEvent.press(getByTestId('decrement-button'));

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('should disable decrement button when at minimum', () => {
    const { getByTestId } = render(
      <ServingSizeControl
        currentServings={1}
        onServingsChange={mockOnChange}
      />
    );

    fireEvent.press(getByTestId('serving-size-badge'));

    const decrementButton = getByTestId('decrement-button');
    expect(decrementButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('should collapse when tapped again in expanded state', () => {
    const { getByTestId, queryByTestId } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    const badge = getByTestId('serving-size-badge');

    // Expand
    fireEvent.press(badge);
    expect(queryByTestId('increment-button')).toBeTruthy();

    // Collapse
    fireEvent.press(badge);
    expect(queryByTestId('increment-button')).toBeNull();
  });

  it('should show correct serving count', () => {
    const { getByTestId, getByText } = render(
      <ServingSizeControl
        currentServings={8}
        onServingsChange={mockOnChange}
      />
    );

    fireEvent.press(getByTestId('serving-size-badge'));
    expect(getByText('8')).toBeTruthy();
  });

  it('should have proper accessibility labels', () => {
    const { getByTestId } = render(
      <ServingSizeControl
        currentServings={4}
        onServingsChange={mockOnChange}
      />
    );

    const badge = getByTestId('serving-size-badge');
    expect(badge.props.accessibilityLabel).toBe('Adjust serving size');
    expect(badge.props.accessibilityRole).toBe('button');

    fireEvent.press(badge);

    const incrementButton = getByTestId('increment-button');
    const decrementButton = getByTestId('decrement-button');

    expect(incrementButton.props.accessibilityLabel).toBe('Increase servings');
    expect(decrementButton.props.accessibilityLabel).toBe('Decrease servings');
  });
});
