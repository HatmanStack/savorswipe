import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchResultItem } from '@/components/SearchResultItem';
import { Recipe } from '@/types';

describe('SearchResultItem', () => {
  const mockRecipe: Recipe = {
    key: 'test-recipe-1',
    Title: 'Chocolate Cake',
    Description: 'A delicious chocolate cake',
    Ingredients: ['flour', 'sugar', 'cocoa'],
    Type: 'dessert',
  };

  it('renders recipe title', () => {
    const { getByText } = render(
      <SearchResultItem recipe={mockRecipe} onPress={jest.fn()} />
    );
    expect(getByText('Chocolate Cake')).toBeTruthy();
  });

  it('renders description when available', () => {
    const { getByText } = render(
      <SearchResultItem recipe={mockRecipe} onPress={jest.fn()} />
    );
    expect(getByText('A delicious chocolate cake')).toBeTruthy();
  });

  it('renders ingredients when description is not available', () => {
    const recipeWithoutDescription: Recipe = {
      key: 'test-recipe-2',
      Title: 'Pasta',
      Ingredients: ['pasta', 'tomato sauce', 'cheese'],
    };

    const { getByText } = render(
      <SearchResultItem recipe={recipeWithoutDescription} onPress={jest.fn()} />
    );
    expect(getByText('pasta, tomato sauce, cheese')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <SearchResultItem recipe={mockRecipe} onPress={onPress} />
    );

    fireEvent.press(getByText('Chocolate Cake'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('handles recipe with no description or ingredients', () => {
    const minimalRecipe: Recipe = {
      key: 'test-recipe-3',
      Title: 'Minimal Recipe',
    };

    const { getByText } = render(
      <SearchResultItem recipe={minimalRecipe} onPress={jest.fn()} />
    );
    expect(getByText('Minimal Recipe')).toBeTruthy();
    expect(getByText('No description available')).toBeTruthy();
  });
});
