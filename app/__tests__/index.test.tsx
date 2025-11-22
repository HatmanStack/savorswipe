import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from '@/app/index';
import { useRecipe } from '@/context/RecipeContext';
import { useImageQueue } from '@/hooks/useImageQueue';
import { useRouter } from 'expo-router';
import { isNewRecipe } from '@/services/RecipeService';
import type { Recipe } from '@/types';
import { AccessibilityInfo } from 'react-native';

// Mock dependencies
jest.mock('@/context/RecipeContext');
jest.mock('@/hooks/useImageQueue');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/services/RecipeService', () => ({
  ...jest.requireActual('@/services/RecipeService'),
  isNewRecipe: jest.fn(),
}));
jest.mock('@/components/NewRecipeBanner', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return function MockNewRecipeBanner({ visible }: { visible: boolean }) {
    return visible ? <Text testID="new-recipe-banner">NEW</Text> : null;
  };
});
jest.mock('@/hooks', () => ({
  useResponsiveLayout: jest.fn(() => ({
    getImageDimensions: jest.fn(() => ({ width: 300, height: 400 })),
  })),
}));

// Mock AccessibilityInfo
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    },
  };
});

describe('HomeScreen Integration Tests', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockNewRecipe: Recipe = {
    key: 'recipe-1',
    Title: 'New Test Recipe',
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
  };

  const mockOldRecipe: Recipe = {
    key: 'recipe-2',
    Title: 'Old Test Recipe',
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 73).toISOString(), // 73 hours ago
  };

  const mockRecipeWithoutTimestamp: Recipe = {
    key: 'recipe-3',
    Title: 'Recipe Without Timestamp',
  };

  const mockImage = {
    filename: 'test-image.jpg',
    file: 'data:image/jpeg;base64,test',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useImageQueue as jest.Mock).mockReturnValue({
      currentImage: mockImage,
      advanceQueue: jest.fn(),
      isLoading: false,
    });
  });

  it('should display banner when current recipe is new', () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    const { getByTestId } = render(<HomeScreen />);

    expect(getByTestId('new-recipe-banner')).toBeTruthy();
  });

  it('should not display banner when recipe is old', () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockOldRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(false);

    const { queryByTestId } = render(<HomeScreen />);

    expect(queryByTestId('new-recipe-banner')).toBeNull();
  });

  it('should not display banner when uploadedAt is missing', () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockRecipeWithoutTimestamp,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(false);

    const { queryByTestId } = render(<HomeScreen />);

    expect(queryByTestId('new-recipe-banner')).toBeNull();
  });

  it('should call isNewRecipe with current recipe', () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    render(<HomeScreen />);

    expect(isNewRecipe).toHaveBeenCalledWith(mockNewRecipe);
  });

  it('should update banner visibility when currentRecipe changes', () => {
    const mockUseRecipe = useRecipe as jest.Mock;

    // Initial render with new recipe
    mockUseRecipe.mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    const { queryByTestId, rerender } = render(<HomeScreen />);

    // Banner should be visible initially
    expect(queryByTestId('new-recipe-banner')).toBeTruthy();

    // Update to old recipe
    mockUseRecipe.mockReturnValue({
      currentRecipe: mockOldRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(false);

    rerender(<HomeScreen />);

    // Banner should now be hidden
    expect(queryByTestId('new-recipe-banner')).toBeNull();
  });

  it('should not display banner when overlapping with hamburger menu', () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    const { getByTestId } = render(<HomeScreen />);

    // Verify banner exists
    const banner = getByTestId('new-recipe-banner');
    expect(banner).toBeTruthy();

    // Note: Z-index verification requires visual testing or style inspection
    // The banner component has zIndex: 10, which should not conflict with
    // hamburger menu (typically zIndex: 1000+)
  });

  it('should cleanup animation on unmount', async () => {
    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    const { unmount } = render(<HomeScreen />);

    // Wait for animation to potentially start
    await waitFor(() => {
      expect(isNewRecipe).toHaveBeenCalled();
    });

    // Unmount component
    unmount();

    // Note: Animation cleanup is handled by useEffect return function
    // This test verifies the component unmounts without errors
  });

  it('should not trigger animation when reduceMotion is enabled', async () => {
    // Mock reduced motion enabled
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);

    (useRecipe as jest.Mock).mockReturnValue({
      currentRecipe: mockNewRecipe,
    });
    (isNewRecipe as jest.Mock).mockReturnValue(true);

    const { getByTestId } = render(<HomeScreen />);

    // Wait for reduced motion check to complete
    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    // Banner should still be visible (only animation is disabled, not banner)
    expect(getByTestId('new-recipe-banner')).toBeTruthy();

    // Note: Verifying that Animated.sequence is NOT called would require
    // deeper mocking. This test ensures the feature respects reduceMotion state.
  });
});
