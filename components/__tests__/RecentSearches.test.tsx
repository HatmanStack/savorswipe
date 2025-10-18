import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecentSearches } from '@/components/RecentSearches';
import { RecentSearch } from '@/types';

describe('RecentSearches', () => {
  const mockSearches: RecentSearch[] = [
    { query: 'chocolate', timestamp: 1634567890000 },
    { query: 'chicken', timestamp: 1634567880000 },
    { query: 'pasta', timestamp: 1634567870000 },
  ];

  it('renders all recent searches', () => {
    const { getByText } = render(
      <RecentSearches
        searches={mockSearches}
        onSearchSelect={jest.fn()}
        onClearAll={jest.fn()}
      />
    );

    expect(getByText('chocolate')).toBeTruthy();
    expect(getByText('chicken')).toBeTruthy();
    expect(getByText('pasta')).toBeTruthy();
  });

  it('calls onSearchSelect with correct query when search item is pressed', () => {
    const onSearchSelect = jest.fn();
    const { getByText } = render(
      <RecentSearches
        searches={mockSearches}
        onSearchSelect={onSearchSelect}
        onClearAll={jest.fn()}
      />
    );

    fireEvent.press(getByText('chocolate'));
    expect(onSearchSelect).toHaveBeenCalledWith('chocolate');

    fireEvent.press(getByText('chicken'));
    expect(onSearchSelect).toHaveBeenCalledWith('chicken');
  });

  it('calls onClearAll when Clear All button is pressed', () => {
    const onClearAll = jest.fn();
    const { getByText } = render(
      <RecentSearches
        searches={mockSearches}
        onSearchSelect={jest.fn()}
        onClearAll={onClearAll}
      />
    );

    fireEvent.press(getByText('Clear All'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('does not render when searches array is empty', () => {
    const { queryByText } = render(
      <RecentSearches
        searches={[]}
        onSearchSelect={jest.fn()}
        onClearAll={jest.fn()}
      />
    );

    expect(queryByText('Recent Searches')).toBeNull();
  });

  it('limits display to 10 searches', () => {
    const manySearches: RecentSearch[] = Array.from({ length: 15 }, (_, i) => ({
      query: `search-${i}`,
      timestamp: Date.now() - i * 1000,
    }));

    const { getByText, queryByText } = render(
      <RecentSearches
        searches={manySearches}
        onSearchSelect={jest.fn()}
        onClearAll={jest.fn()}
      />
    );

    // First 10 should be visible
    expect(getByText('search-0')).toBeTruthy();
    expect(getByText('search-9')).toBeTruthy();

    // 11th and beyond should not be visible
    expect(queryByText('search-10')).toBeNull();
    expect(queryByText('search-14')).toBeNull();
  });
});
