/**
 * Tests for ErrorDetailModal Component
 * Displays detailed upload error information
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ErrorDetailModal } from '../ErrorDetailModal'
import { UploadError } from '@/types/upload'

describe('ErrorDetailModal', () => {
  const mockOnClose = jest.fn()

  const mockErrors: UploadError[] = [
    {
      file: 1,
      title: 'Chocolate Cake',
      reason: 'Missing ingredients list',
    },
    {
      file: 2,
      title: 'Apple Pie',
      reason: 'Invalid recipe format',
    },
    {
      file: 3,
      title: 'Pasta Carbonara',
      reason: 'OCR extraction failed',
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Test 1: Modal not visible when prop is false
  it('test_not_visible_when_prop_false: should not render modal when visible=false', () => {
    const { queryByText } = render(
      <ErrorDetailModal visible={false} errors={mockErrors} onClose={mockOnClose} />
    )

    expect(queryByText('Upload Errors')).toBeNull()
  })

  // Test 2: Modal visible when prop is true
  it('test_visible_when_prop_true: should render modal when visible=true', () => {
    const { getByText } = render(
      <ErrorDetailModal visible={true} errors={mockErrors} onClose={mockOnClose} />
    )

    expect(getByText('Upload Errors')).toBeTruthy()
  })

  // Test 3: Display all errors in the list
  it('test_displays_error_list: should display all 3 errors', () => {
    const { getByText } = render(
      <ErrorDetailModal visible={true} errors={mockErrors} onClose={mockOnClose} />
    )

    expect(getByText(/Chocolate Cake/)).toBeTruthy()
    expect(getByText(/Apple Pie/)).toBeTruthy()
    expect(getByText(/Pasta Carbonara/)).toBeTruthy()
  })

  // Test 4: Error format includes file number, title, and reason
  it('test_error_format: should show file number, title, and reason for each error', () => {
    const { getByText } = render(
      <ErrorDetailModal visible={true} errors={mockErrors} onClose={mockOnClose} />
    )

    // Check for file numbers
    expect(getByText(/File 1/)).toBeTruthy()
    expect(getByText(/File 2/)).toBeTruthy()
    expect(getByText(/File 3/)).toBeTruthy()

    // Check for reasons
    expect(getByText(/Missing ingredients list/)).toBeTruthy()
    expect(getByText(/Invalid recipe format/)).toBeTruthy()
    expect(getByText(/OCR extraction failed/)).toBeTruthy()
  })

  // Test 5: Close button calls onClose callback
  it('test_close_button_calls_onClose: should call onClose when close button pressed', () => {
    const { getByText } = render(
      <ErrorDetailModal visible={true} errors={mockErrors} onClose={mockOnClose} />
    )

    const closeButton = getByText('Close')
    fireEvent.press(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  // Test 6: Empty errors array shows "No errors" message
  it('test_empty_errors_array: should show "No errors" when errors array is empty', () => {
    const { getByText } = render(
      <ErrorDetailModal visible={true} errors={[]} onClose={mockOnClose} />
    )

    expect(getByText(/No errors/)).toBeTruthy()
  })

  // Test 7: Scrollable long list with many errors
  it('test_scrollable_long_list: should render FlatList with 20 errors', () => {
    const manyErrors: UploadError[] = Array.from({ length: 20 }, (_, i) => ({
      file: i + 1,
      title: `Recipe ${i + 1}`,
      reason: `Error reason ${i + 1}`,
    }))

    const { getByText, getAllByText } = render(
      <ErrorDetailModal visible={true} errors={manyErrors} onClose={mockOnClose} />
    )

    // Verify at least the first few errors are rendered (FlatList virtualizes)
    expect(getByText(/Recipe 1$/)).toBeTruthy()
    expect(getByText(/Error reason 1$/)).toBeTruthy()

    // Verify there are multiple recipe items rendered (FlatList is working)
    const recipeElements = getAllByText(/Recipe \d+$/)
    expect(recipeElements.length).toBeGreaterThan(1)
  })
})
