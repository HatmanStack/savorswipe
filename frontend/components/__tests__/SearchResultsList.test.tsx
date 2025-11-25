import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchResultsList } from '@/components/SearchResultsList';
import { Recipe } from '@/types';

describe('SearchResultsList', () => {
  const mockRecipes: Recipe[] = [
    {
      key: 'recipe-1',
      Title: 'Chocolate Cake',
      Description: 'A delicious chocolate cake',
    },
    {
      key: 'recipe-2',
      Title: 'Vanilla Cake',
      Description: 'A sweet vanilla cake',
    },
    {
      key: 'recipe-3',
      Title: 'Strawberry Cake',
      Description: 'A fruity strawberry cake',
    },
  ];

  it('renders all recipe items', () => {
    const { getByText } = render(
      <SearchResultsList results={mockRecipes} onResultPress={jest.fn()} />
    );

    expect(getByText('Chocolate Cake')).toBeTruthy();
    expect(getByText('Vanilla Cake')).toBeTruthy();
    expect(getByText('Strawberry Cake')).toBeTruthy();
  });

  it('calls onResultPress with correct recipe key when item is pressed', () => {
    const onResultPress = jest.fn();
    const { getByText } = render(
      <SearchResultsList results={mockRecipes} onResultPress={onResultPress} />
    );

    fireEvent.press(getByText('Chocolate Cake'));
    expect(onResultPress).toHaveBeenCalledWith('recipe-1');

    fireEvent.press(getByText('Vanilla Cake'));
    expect(onResultPress).toHaveBeenCalledWith('recipe-2');
  });

  it('renders empty list when no results provided', () => {
    const { queryByText } = render(
      <SearchResultsList results={[]} onResultPress={jest.fn()} />
    );

    expect(queryByText('Chocolate Cake')).toBeNull();
  });
});
