import React from 'react';
import { render } from '@testing-library/react-native';
import NewRecipeBanner from '@/components/NewRecipeBanner';

// Mock the useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#ffffff'),
}));

describe('NewRecipeBanner', () => {
  it('should render when visible is true', () => {
    const { queryByText } = render(<NewRecipeBanner visible={true} />);

    expect(queryByText('NEW')).toBeTruthy();
  });

  it('should not render when visible is false', () => {
    const { queryByText } = render(<NewRecipeBanner visible={false} />);

    expect(queryByText('NEW')).toBeNull();
  });

  it('should have correct accessibility attributes', () => {
    const { getByLabelText } = render(<NewRecipeBanner visible={true} />);

    const container = getByLabelText('New recipe');

    // Check that the container View has accessibility attributes
    expect(container.props.accessibilityLabel).toBe('New recipe');
    expect(container.props.accessibilityRole).toBe('text');
  });

  it('should use theme colors', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useThemeColor } = require('@/hooks/useThemeColor');

    render(<NewRecipeBanner visible={true} />);

    // Verify useThemeColor was called with correct parameters
    expect(useThemeColor).toHaveBeenCalledWith(
      { light: '#fff', dark: '#333' },
      'background'
    );
  });
});
