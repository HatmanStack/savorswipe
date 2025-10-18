import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SearchInput } from '@/components/SearchInput';

describe('SearchInput', () => {
  it('renders correctly with placeholder', () => {
    const { getByPlaceholderText } = render(
      <SearchInput value="" onChangeText={jest.fn()} placeholder="Search test" />
    );
    expect(getByPlaceholderText('Search test')).toBeTruthy();
  });

  it('calls onChangeText after debounce delay', async () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <SearchInput value="" onChangeText={onChangeText} />
    );

    const input = getByPlaceholderText('Search recipes...');
    fireEvent.changeText(input, 'chocolate');

    // Should not call immediately
    expect(onChangeText).not.toHaveBeenCalled();

    // Should call after 300ms debounce
    await waitFor(() => expect(onChangeText).toHaveBeenCalledWith('chocolate'), {
      timeout: 400,
    });
  });

  it('shows clear button when text is present', () => {
    const { queryByTestId, getByTestId, rerender } = render(
      <SearchInput value="" onChangeText={jest.fn()} />
    );

    // Clear button should not be visible initially
    expect(queryByTestId('clear-button')).toBeNull();

    // Rerender with text
    rerender(<SearchInput value="test" onChangeText={jest.fn()} />);

    // Now clear button should be visible
    expect(getByTestId('clear-button')).toBeTruthy();
  });

  it('clears input when clear button is pressed', async () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText, getByTestId } = render(
      <SearchInput value="chocolate" onChangeText={onChangeText} autoFocus={false} />
    );

    const input = getByPlaceholderText('Search recipes...');
    expect(input.props.value).toBe('chocolate');

    // Find and press clear button using testID
    const clearButton = getByTestId('clear-button');
    fireEvent.press(clearButton);

    // Should clear the input
    await waitFor(() => {
      expect(onChangeText).toHaveBeenCalledWith('');
    });
  });
});
