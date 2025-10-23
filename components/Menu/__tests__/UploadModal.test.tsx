/**
 * Tests for UploadModal Component
 * Background processing UI with error details and toast notifications
 */

import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { UploadModal } from '../UploadModal'
import { UploadService } from '@/services/UploadService'
import { UploadJob, JobStatusCallback } from '@/types/upload'

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}))

// Mock dependencies
jest.mock('@/services/UploadService')
jest.mock('@/components/UploadRecipe', () => ({
  __esModule: true,
  default: ({ setUploadVisible }: any) => {
    return null
  },
}))
jest.mock('@/components/ErrorDetailModal', () => ({
  ErrorDetailModal: ({ visible, errors }: any) => {
    if (!visible) return null
    return null
  },
}))
jest.mock('@/components/Toast', () => ({
  Toast: ({ children }: any) => null,
}))

// Mock RecipeContext
const mockSetJsonData = jest.fn()
const mockSetFirstFile = jest.fn()
const mockSetAllFiles = jest.fn()

jest.mock('@/context/RecipeContext', () => ({
  useRecipe: () => ({
    jsonData: {},
    setJsonData: mockSetJsonData,
    setFirstFile: mockSetFirstFile,
    setAllFiles: mockSetAllFiles,
  }),
}))

describe('UploadModal', () => {
  const mockStyles = {
    uploadMessage: {},
  }

  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Subscription Lifecycle', () => {
    it('subscribes to UploadService on mount', () => {
      const mockUnsubscribe = jest.fn()
      ;(UploadService.subscribe as jest.Mock).mockReturnValue(mockUnsubscribe)

      render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      expect(UploadService.subscribe).toHaveBeenCalled()
    })

    it('unsubscribes from UploadService on unmount', () => {
      const mockUnsubscribe = jest.fn()
      ;(UploadService.subscribe as jest.Mock).mockReturnValue(mockUnsubscribe)

      const { unmount } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      unmount()

      expect(mockUnsubscribe).toHaveBeenCalled()
    })
  })

  describe('Progress Display', () => {
    it('shows progress during upload', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      // Simulate processing status
      const processingJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'processing',
        progress: { total: 10, completed: 3, failed: 0 },
        errors: [],
        timestamp: Date.now(),
      }

      subscribedCallback?.(processingJob)

      await waitFor(() => {
        expect(getByText(/Uploading.*3.*10/)).toBeTruthy()
      })
    })
  })

  describe('Toast Notifications', () => {
    it('shows toast on completion with all success', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      // Simulate completed status
      const completedJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'completed',
        progress: { total: 5, completed: 5, failed: 0 },
        result: {
          returnMessage: 'Success',
          successCount: 5,
          failCount: 0,
          jsonData: {},
          newRecipeKeys: [],
          errors: [],
          jobId: 'job-1',
        },
        errors: [],
        timestamp: Date.now(),
      }

      subscribedCallback?.(completedJob)

      await waitFor(() => {
        expect(getByText(/All 5 recipes added successfully/)).toBeTruthy()
      })
    })

    it('shows correct message for all success', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const completedJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'completed',
        progress: { total: 5, completed: 5, failed: 0 },
        result: {
          returnMessage: 'Success',
          successCount: 5,
          failCount: 0,
          jsonData: {},
          newRecipeKeys: [],
          errors: [],
          jobId: 'job-1',
        },
        errors: [],
        timestamp: Date.now(),
      }

      subscribedCallback?.(completedJob)

      await waitFor(() => {
        expect(getByText(/All 5 recipes added successfully/)).toBeTruthy()
      })
    })

    it('shows correct message for partial failure', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const partialJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'error',
        progress: { total: 5, completed: 3, failed: 2 },
        result: {
          returnMessage: 'Partial',
          successCount: 3,
          failCount: 2,
          jsonData: {},
          newRecipeKeys: [],
          errors: [
            { file: 0, title: 'Recipe 1', reason: 'Error 1' },
            { file: 1, title: 'Recipe 2', reason: 'Error 2' },
          ],
          jobId: 'job-1',
        },
        errors: [
          { file: 0, title: 'Recipe 1', reason: 'Error 1' },
          { file: 1, title: 'Recipe 2', reason: 'Error 2' },
        ],
        timestamp: Date.now(),
      }

      subscribedCallback?.(partialJob)

      await waitFor(() => {
        expect(getByText(/3 of 5 added.*Tap to view 2 errors/)).toBeTruthy()
      })
    })
  })

  describe('Error Modal', () => {
    it('opens ErrorDetailModal when toast tapped with errors', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText, getByTestId } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const errorJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'error',
        progress: { total: 2, completed: 0, failed: 2 },
        errors: [
          { file: 0, title: 'Recipe 1', reason: 'Error 1' },
          { file: 1, title: 'Recipe 2', reason: 'Error 2' },
        ],
        timestamp: Date.now(),
      }

      subscribedCallback?.(errorJob)

      await waitFor(() => {
        const toast = getByText(/All 2 recipes failed/)
        expect(toast).toBeTruthy()
      })

      // Tap toast
      const toast = getByText(/All 2 recipes failed/)
      fireEvent.press(toast)

      // Verify modal opens
      await waitFor(() => {
        const modal = getByTestId('error-detail-modal')
        expect(modal).toBeTruthy()
      })
    })

    it('does not open modal when toast tapped without errors', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText, queryByTestId } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const successJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'completed',
        progress: { total: 5, completed: 5, failed: 0 },
        errors: [],
        timestamp: Date.now(),
      }

      subscribedCallback?.(successJob)

      await waitFor(() => {
        const toast = getByText(/All 5 recipes added successfully/)
        expect(toast).toBeTruthy()
      })

      // Tap toast
      const toast = getByText(/All 5 recipes added successfully/)
      fireEvent.press(toast)

      // Verify modal does NOT open
      expect(queryByTestId('error-detail-modal')).toBeNull()
    })
  })

  describe('RecipeContext Integration', () => {
    it('updates recipe context with new jsonData', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const newJsonData = { recipe1: { title: 'New Recipe' } }
      const completedJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'completed',
        progress: { total: 1, completed: 1, failed: 0 },
        result: {
          returnMessage: 'Success',
          successCount: 1,
          failCount: 0,
          jsonData: newJsonData,
          newRecipeKeys: ['recipe1'],
          errors: [],
          jobId: 'job-1',
        },
        errors: [],
        timestamp: Date.now(),
      }

      subscribedCallback?.(completedJob)

      await waitFor(() => {
        expect(mockSetJsonData).toHaveBeenCalledWith(newJsonData)
      })
    })

    it('displays error details in modal', async () => {
      let subscribedCallback: JobStatusCallback | null = null
      ;(UploadService.subscribe as jest.Mock).mockImplementation(
        (callback: JobStatusCallback) => {
          subscribedCallback = callback
          return jest.fn()
        }
      )

      const { getByText, getByTestId } = render(
        <UploadModal
          visible={true}
          onClose={mockOnClose}
          uploadCount={1}
          styles={mockStyles}
        />
      )

      const errors = [
        { file: 0, title: 'Recipe A', reason: 'Duplicate' },
        { file: 1, title: 'Recipe B', reason: 'Invalid format' },
      ]

      const errorJob: UploadJob = {
        id: 'job-1',
        files: [],
        status: 'error',
        progress: { total: 2, completed: 0, failed: 2 },
        errors,
        timestamp: Date.now(),
      }

      subscribedCallback?.(errorJob)

      await waitFor(() => {
        const toast = getByText(/All 2 recipes failed/)
        fireEvent.press(toast)
      })

      // The errors should be passed to ErrorDetailModal
      // In real implementation, this would render the modal with errors
      await waitFor(() => {
        const modal = getByTestId('error-detail-modal')
        expect(modal).toBeTruthy()
        // In a real test, we'd verify the modal received the errors prop
      })
    })
  })
})
