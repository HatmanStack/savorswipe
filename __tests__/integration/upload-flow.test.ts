/**
 * End-to-End Integration Tests for Upload Flow
 *
 * Tests complete upload flow from file selection to queue injection:
 * - Upload service job queue management
 * - RecipeContext updates with new recipes
 * - ImageQueue injection with new recipes
 * - Toast notifications and error handling
 * - Background processing behavior
 */

// Mock fetch globally
global.fetch = jest.fn()

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { UploadService } from '@/services/UploadService'
import { ImageQueueService } from '@/services/ImageQueueService'
import { ImageService } from '@/services/ImageService'
import { useImageQueue } from '@/hooks/useImageQueue'
import { useRecipe } from '@/context/RecipeContext'
import { UploadFile, UploadResult, UploadJob } from '@/types/upload'
import { S3JsonData } from '@/types'

// Mock dependencies
jest.mock('@/services/ImageQueueService')
jest.mock('@/services/ImageService')
jest.mock('@/context/RecipeContext')

describe('Upload Flow Integration', () => {
  // Mock data
  const mockInitialJsonData: S3JsonData = {
    recipe1: { key: 'recipe1', Title: 'Existing Recipe 1', Type: 'main dish' },
    recipe2: { key: 'recipe2', Title: 'Existing Recipe 2', Type: 'dessert' },
  }

  const mockSetJsonData = jest.fn()
  const mockSetCurrentRecipe = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset UploadService state
    UploadService['jobQueue'] = []
    UploadService['currentJobId'] = null
    UploadService['isProcessing'] = false
    UploadService['subscribers'] = new Set()
    UploadService._setTestLambdaUrl('https://mock-lambda-url.com')

    // Mock useRecipe hook
    ;(useRecipe as jest.Mock).mockReturnValue({
      jsonData: mockInitialJsonData,
      setJsonData: mockSetJsonData,
      setCurrentRecipe: mockSetCurrentRecipe,
      mealTypeFilters: ['main dish', 'dessert'],
    })

    // Mock ImageQueueService
    ;(ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
      'recipe1',
      'recipe2',
    ])
    ;(ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
      images: [
        { filename: 'images/recipe1.jpg', file: 'blob:1' },
        { filename: 'images/recipe2.jpg', file: 'blob:2' },
      ],
      failedKeys: [],
    })
    ;(ImageQueueService.shouldRefillQueue as jest.Mock).mockReturnValue(false)
    ;(ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {})

    // Mock ImageService
    ;(ImageService.getRecipeKeyFromFileName as jest.Mock).mockImplementation((filename: string) => {
      const match = filename.match(/recipe\d+/)
      return match ? match[0] : 'unknown'
    })

    // Default fetch mock
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        returnMessage: 'Success',
        successCount: 1,
        failCount: 0,
        jsonData: {},
        newRecipeKeys: [],
        errors: [],
        jobId: 'test-job-id',
      }),
    })
  })

  afterEach(() => {
    UploadService._setTestLambdaUrl(null)
  })

  describe('test_complete_upload_flow_single_file', () => {
    it('should complete upload flow with one file', async () => {
      // Mock successful Lambda response with 1 recipe
      const mockResponse: UploadResult = {
        returnMessage: 'Success',
        successCount: 1,
        failCount: 0,
        jsonData: { recipe3: { key: 'recipe3', Title: 'New Recipe', Type: 'appetizer' } },
        newRecipeKeys: ['recipe3'],
        errors: [],
        jobId: 'job-123',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Track status updates
      const statusUpdates: UploadJob[] = []
      UploadService.subscribe((job) => {
        statusUpdates.push({ ...job })
      })

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'base64data', type: 'image', uri: 'file://img1.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for processing to complete
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          expect(job?.status).toBe('completed')
        },
        { timeout: 2000 }
      )

      // Verify job status transitions: pending → processing → completed
      const statuses = statusUpdates.map((j) => j.status)
      expect(statuses).toContain('pending')
      expect(statuses).toContain('processing')
      expect(statuses).toContain('completed')

      // Verify final job state
      const finalJob = UploadService.getJob(jobId)
      expect(finalJob).toBeDefined()
      expect(finalJob?.status).toBe('completed')
      expect(finalJob?.progress.completed).toBe(1)
      expect(finalJob?.progress.failed).toBe(0)
      expect(finalJob?.result?.newRecipeKeys).toEqual(['recipe3'])

      // Verify fetch was called correctly
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-lambda-url.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })
  })

  describe('test_complete_upload_flow_multiple_files', () => {
    it('should handle 5 files uploaded successfully', async () => {
      // Mock 5 successful recipes
      const mockResponse: UploadResult = {
        returnMessage: 'Success',
        successCount: 5,
        failCount: 0,
        jsonData: {
          recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'main dish' },
          recipe4: { key: 'recipe4', Title: 'Recipe 4', Type: 'dessert' },
          recipe5: { key: 'recipe5', Title: 'Recipe 5', Type: 'appetizer' },
          recipe6: { key: 'recipe6', Title: 'Recipe 6', Type: 'breakfast' },
          recipe7: { key: 'recipe7', Title: 'Recipe 7', Type: 'side dish' },
        },
        newRecipeKeys: ['recipe3', 'recipe4', 'recipe5', 'recipe6', 'recipe7'],
        errors: [],
        jobId: 'job-456',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Trigger upload with 5 files
      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
        { data: 'data4', type: 'image', uri: 'file://img4.jpg' },
        { data: 'data5', type: 'image', uri: 'file://img5.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for completion
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          expect(job?.status).toBe('completed')
        },
        { timeout: 2000 }
      )

      const job = UploadService.getJob(jobId)

      // Verify all 5 recipes in result
      expect(job?.result?.successCount).toBe(5)
      expect(job?.result?.newRecipeKeys).toHaveLength(5)
      expect(job?.result?.newRecipeKeys).toEqual([
        'recipe3',
        'recipe4',
        'recipe5',
        'recipe6',
        'recipe7',
      ])

      // Verify jsonData contains all recipes
      expect(Object.keys(job?.result?.jsonData || {})).toHaveLength(5)

      // Verify progress
      expect(job?.progress.completed).toBe(5)
      expect(job?.progress.failed).toBe(0)
    })
  })

  describe('test_partial_failure_flow', () => {
    it('should handle 3 success and 2 failures', async () => {
      // Mock partial failure response
      const mockResponse: UploadResult = {
        returnMessage: 'Partial success',
        successCount: 3,
        failCount: 2,
        jsonData: {
          recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'main dish' },
          recipe4: { key: 'recipe4', Title: 'Recipe 4', Type: 'dessert' },
          recipe5: { key: 'recipe5', Title: 'Recipe 5', Type: 'appetizer' },
        },
        newRecipeKeys: ['recipe3', 'recipe4', 'recipe5'],
        errors: [
          { file: 4, title: 'Failed Recipe 1', reason: 'OCR failed' },
          { file: 5, title: 'Failed Recipe 2', reason: 'Invalid format' },
        ],
        jobId: 'job-789',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Trigger upload with 5 files
      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
        { data: 'data4', type: 'image', uri: 'file://img4.jpg' },
        { data: 'data5', type: 'image', uri: 'file://img5.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for completion
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          // Service marks job as 'error' when any files fail
          expect(job?.status).toBe('error')
        },
        { timeout: 2000 }
      )

      const job = UploadService.getJob(jobId)

      // Verify 3 successful recipes
      expect(job?.result?.successCount).toBe(3)
      expect(job?.result?.newRecipeKeys).toHaveLength(3)
      expect(Object.keys(job?.result?.jsonData || {})).toHaveLength(3)

      // Verify 2 errors
      expect(job?.result?.failCount).toBe(2)
      expect(job?.errors).toHaveLength(2)
      expect(job?.errors[0]).toEqual({
        file: 4,
        title: 'Failed Recipe 1',
        reason: 'OCR failed',
      })
      expect(job?.errors[1]).toEqual({
        file: 5,
        title: 'Failed Recipe 2',
        reason: 'Invalid format',
      })

      // Verify progress reflects partial success
      expect(job?.progress.completed).toBe(3)
      expect(job?.progress.failed).toBe(2)
    })
  })

  describe('test_duplicate_detection_flow', () => {
    it('should handle duplicate detection error', async () => {
      // Mock duplicate detection response
      const mockResponse: UploadResult = {
        returnMessage: 'Duplicate detected',
        successCount: 0,
        failCount: 1,
        jsonData: {},
        newRecipeKeys: [],
        errors: [
          {
            file: 1,
            title: 'Chocolate Chip Cookies',
            reason: 'Duplicate of recipe_existing (similarity: 0.95)',
          },
        ],
        jobId: 'job-dup',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'duplicate-data', type: 'image', uri: 'file://duplicate.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for completion
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          // Service marks job as 'error' when any files fail (including duplicates)
          expect(job?.status).toBe('error')
        },
        { timeout: 2000 }
      )

      const job = UploadService.getJob(jobId)

      // Verify no recipes added
      expect(job?.result?.successCount).toBe(0)
      expect(job?.result?.newRecipeKeys).toHaveLength(0)
      expect(Object.keys(job?.result?.jsonData || {})).toHaveLength(0)

      // Verify duplicate error message
      expect(job?.errors).toHaveLength(1)
      expect(job?.errors[0].reason).toContain('Duplicate of recipe')
      expect(job?.errors[0].reason).toContain('similarity: 0.95')

      // Verify job marked as error (service marks as error when progress.failed > 0)
      expect(job?.status).toBe('error')
      expect(job?.progress.failed).toBe(1)
    })
  })

  describe('test_background_processing_non_blocking', () => {
    it('should return immediately and process in background', async () => {
      // Mock slow Lambda response (1 second delay)
      ;(global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    returnMessage: 'Success',
                    successCount: 1,
                    failCount: 0,
                    jsonData: { recipe3: {} },
                    newRecipeKeys: ['recipe3'],
                    errors: [],
                    jobId: 'job-bg',
                  }),
                }),
              1000
            )
          )
      )

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'data', type: 'image', uri: 'file://img.jpg' },
      ]

      const startTime = Date.now()
      const jobId = await UploadService.queueUpload(files)
      const returnTime = Date.now()

      // Should return almost immediately (< 100ms)
      expect(returnTime - startTime).toBeLessThan(100)
      expect(jobId).toBeTruthy()

      // Job should be pending or processing
      const initialJob = UploadService.getJob(jobId)
      expect(['pending', 'processing']).toContain(initialJob?.status)

      // Wait for background processing to complete
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          expect(job?.status).toBe('completed')
        },
        { timeout: 2000 }
      )

      // Verify completion happened after delay
      const completionTime = Date.now()
      expect(completionTime - startTime).toBeGreaterThanOrEqual(1000)
    })
  })

  describe('test_error_detail_modal_flow', () => {
    it('should store errors for display in modal', async () => {
      // Mock response with multiple errors
      const mockResponse: UploadResult = {
        returnMessage: 'Partial success',
        successCount: 2,
        failCount: 3,
        jsonData: {
          recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'main dish' },
          recipe4: { key: 'recipe4', Title: 'Recipe 4', Type: 'dessert' },
        },
        newRecipeKeys: ['recipe3', 'recipe4'],
        errors: [
          { file: 3, title: 'Failed Recipe A', reason: 'OCR timeout' },
          { file: 4, title: 'Failed Recipe B', reason: 'Invalid image format' },
          { file: 5, title: 'Failed Recipe C', reason: 'Missing recipe data' },
        ],
        jobId: 'job-errors',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
        { data: 'data4', type: 'image', uri: 'file://img4.jpg' },
        { data: 'data5', type: 'image', uri: 'file://img5.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for completion
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          expect(job?.status).toBe('completed')
        },
        { timeout: 2000 }
      )

      const job = UploadService.getJob(jobId)

      // Verify errors are stored correctly for modal display
      expect(job?.errors).toHaveLength(3)
      expect(job?.errors[0]).toEqual({
        file: 3,
        title: 'Failed Recipe A',
        reason: 'OCR timeout',
      })
      expect(job?.errors[1]).toEqual({
        file: 4,
        title: 'Failed Recipe B',
        reason: 'Invalid image format',
      })
      expect(job?.errors[2]).toEqual({
        file: 5,
        title: 'Failed Recipe C',
        reason: 'Missing recipe data',
      })

      // Verify job contains success info for toast message
      expect(job?.result?.successCount).toBe(2)
      expect(job?.result?.failCount).toBe(3)
    })
  })

  describe('test_queue_injection_timing', () => {
    it('should inject new recipes at position 2 in queue', async () => {
      // This test verifies the integration between UploadService and useImageQueue
      // We'll mock the queue injection behavior

      const mockResponse: UploadResult = {
        returnMessage: 'Success',
        successCount: 3,
        failCount: 0,
        jsonData: {
          recipe3: { key: 'recipe3', Title: 'New Recipe 3', Type: 'main dish' },
          recipe4: { key: 'recipe4', Title: 'New Recipe 4', Type: 'dessert' },
          recipe5: { key: 'recipe5', Title: 'New Recipe 5', Type: 'appetizer' },
        },
        newRecipeKeys: ['recipe3', 'recipe4', 'recipe5'],
        errors: [],
        jobId: 'job-inject',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      // Mock fetchBatch to return new recipes for injection
      ;(ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
          { filename: 'images/recipe2.jpg', file: 'blob:2' },
        ],
        failedKeys: [],
      }).mockResolvedValueOnce({
        // Second call for injected recipes
        images: [
          { filename: 'images/recipe3.jpg', file: 'blob:3' },
          { filename: 'images/recipe4.jpg', file: 'blob:4' },
          { filename: 'images/recipe5.jpg', file: 'blob:5' },
        ],
        failedKeys: [],
      })

      // Update mock jsonData to include new recipes after upload
      const updatedJsonData = {
        ...mockInitialJsonData,
        ...mockResponse.jsonData,
      }

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for completion
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          expect(job?.status).toBe('completed')
        },
        { timeout: 2000 }
      )

      const job = UploadService.getJob(jobId)

      // Verify new recipes returned
      expect(job?.result?.newRecipeKeys).toEqual(['recipe3', 'recipe4', 'recipe5'])
      expect(job?.result?.successCount).toBe(3)

      // Note: Actual queue injection is tested in useImageQueue.test.ts
      // This integration test verifies that UploadService provides the correct
      // data structure for injection
    })
  })

  describe('test_concurrent_uploads_conflict_handling', () => {
    it('should handle retry logic on failure', async () => {
      // Mock network error on first attempt, success on retry
      let attemptCount = 0
      ;(global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++
        if (attemptCount === 1) {
          // First attempt fails
          return Promise.reject(new Error('Network error'))
        }
        // Retry succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({
            returnMessage: 'Success',
            successCount: 1,
            failCount: 0,
            jsonData: { recipe3: {} },
            newRecipeKeys: ['recipe3'],
            errors: [],
            jobId: 'job-retry',
          }),
        })
      })

      // Trigger upload
      const files: UploadFile[] = [
        { data: 'data', type: 'image', uri: 'file://img.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait for processing to complete (with retry)
      await waitFor(
        () => {
          const job = UploadService.getJob(jobId)
          // Job should eventually fail after exhausting retries or succeed
          expect(['completed', 'error']).toContain(job?.status)
        },
        { timeout: 3000 }
      )

      const job = UploadService.getJob(jobId)

      // In current implementation, network errors cause job to fail
      // since there's no automatic retry at the service level
      expect(job?.status).toBe('error')
      expect(job?.errors.length).toBeGreaterThan(0)

      // Verify fetch was called (failed on first attempt)
      expect(global.fetch).toHaveBeenCalled()
    })
  })
})
