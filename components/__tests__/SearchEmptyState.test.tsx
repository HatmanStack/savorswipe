import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchEmptyState } from '@/components/SearchEmptyState';

describe('SearchEmptyState', () => {
  it('renders empty state message', () => {
    const { getByText } = render(<SearchEmptyState query="test query" />);

    expect(getByText('No recipes found')).toBeTruthy();
  });

  it('displays the query that returned no results', () => {
    const { getByText } = render(<SearchEmptyState query="chocolate banana" />);

    expect(getByText('for "chocolate banana"')).toBeTruthy();
  });

  it('displays search suggestions', () => {
    const { getByText } = render(<SearchEmptyState query="test" />);

    expect(getByText(/Try searching for single ingredients/)).toBeTruthy();
    expect(getByText(/Check your spelling/)).toBeTruthy();
    expect(getByText(/Try broader terms/)).toBeTruthy();
  });

  it('displays popular ingredient suggestions', () => {
    const mockOnSuggestionPress = jest.fn();
    const { getByText } = render(
      <SearchEmptyState query="test" onSuggestionPress={mockOnSuggestionPress} />
    );

    expect(getByText('chicken')).toBeTruthy();
    expect(getByText('pasta')).toBeTruthy();
    expect(getByText('chocolate')).toBeTruthy();
  });

  it('calls onSuggestionPress when suggestion chip is tapped', () => {
    const mockOnSuggestionPress = jest.fn();
    const { getByText } = render(
      <SearchEmptyState query="test" onSuggestionPress={mockOnSuggestionPress} />
    );

    fireEvent.press(getByText('chicken'));

    expect(mockOnSuggestionPress).toHaveBeenCalledWith('chicken');
  });

  it('does not render suggestion chips if onSuggestionPress is not provided', () => {
    const { queryByText } = render(<SearchEmptyState query="test" />);

    // Popular ingredients title should not be present
    expect(queryByText('Popular ingredients:')).toBeNull();
  });
});
