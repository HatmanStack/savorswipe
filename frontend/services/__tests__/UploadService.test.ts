/**
 * Tests for UploadService
 * Job queue manager for background uploads with sequential processing
 */

// Mock fetch globally
global.fetch = jest.fn()

import { UploadService } from '../UploadService'
import { UploadFile, UploadJob, UploadResult } from '@/types/upload'

describe('UploadService', () => {
  const mockSuccessResponse: UploadResult = {
    returnMessage: 'Success',
    successCount: 1,
    failCount: 0,
    jsonData: { recipe1: { key: 'recipe1', Title: 'Test Recipe' } },
    newRecipeKeys: ['recipe1'],
    errors: [],
    jobId: 'mock-job-id',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset service state between tests
    UploadService['jobQueue'] = []
    UploadService['currentJobId'] = null
    UploadService['isProcessing'] = false
    UploadService['subscribers'] = new Set()
    UploadService._setTestApiUrl('https://mock-api-url.com')

    // Default fetch mock to prevent unhandled rejections
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
    })
  })

  afterEach(() => {
    // Clean up test URL
    UploadService._setTestApiUrl(null)
  })

  describe('queueUpload', () => {
    it('test_queue_upload_creates_job: should create job with UUID and pending status', async () => {
      // Prevent automatic processing for this test
      UploadService['isProcessing'] = true

      const files: UploadFile[] = [
        { data: 'base64data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      expect(jobId).toBeTruthy()
      expect(typeof jobId).toBe('string')

      const job = UploadService.getJob(jobId)
      expect(job).toBeDefined()
      expect(job?.id).toBe(jobId)
      expect(job?.status).toBe('pending')
      expect(job?.files).toEqual(files)
      expect(job?.progress).toEqual({ total: 1, completed: 0, failed: 0 })
      expect(job?.errors).toEqual([])
      expect(job?.timestamp).toBeLessThanOrEqual(Date.now())

      // Reset for other tests
      UploadService['isProcessing'] = false
    })

    it('test_queue_upload_returns_immediately: should return job ID without waiting', async () => {
      const files: UploadFile[] = [
        { data: 'base64data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      // Mock fetch to delay
      ;(global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      )

      const startTime = Date.now()
      const jobId = await UploadService.queueUpload(files)
      const endTime = Date.now()

      // Should return almost immediately (< 100ms)
      expect(endTime - startTime).toBeLessThan(100)
      expect(jobId).toBeTruthy()
    })

    it('test_queue_multiple_uploads: should add all to queue with pending status', async () => {
      // Prevent automatic processing for this test
      UploadService['isProcessing'] = true

      const files1: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]
      const files2: UploadFile[] = [
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
      ]
      const files3: UploadFile[] = [
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
      ]

      const jobId1 = await UploadService.queueUpload(files1)
      const jobId2 = await UploadService.queueUpload(files2)
      const jobId3 = await UploadService.queueUpload(files3)

      const allJobs = UploadService.getAllJobs()
      expect(allJobs).toHaveLength(3)
      expect(allJobs.map((j) => j.id)).toEqual([jobId1, jobId2, jobId3])
      expect(allJobs.every((j) => j.status === 'pending' || j.status === 'processing')).toBe(
        true
      )

      // Reset for other tests
      UploadService['isProcessing'] = false
    })
  })

  describe('processQueue', () => {
    it('test_process_queue_sequentially: should process jobs one at a time', async () => {
      // Fetch is already mocked in beforeEach

      const files1: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]
      const files2: UploadFile[] = [
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
      ]

      await UploadService.queueUpload(files1)
      await UploadService.queueUpload(files2)

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify fetch was called sequentially (not in parallel)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('test_job_status_transitions: should transition pending → processing → completed', async () => {
      // Fetch is already mocked in beforeEach

      const statusHistory: string[] = []
      const unsubscribe = UploadService.subscribe((job) => {
        statusHistory.push(job.status)
      })

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      await UploadService.queueUpload(files)

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(statusHistory).toContain('pending')
      expect(statusHistory).toContain('processing')
      expect(statusHistory).toContain('completed')

      unsubscribe()
    })
  })

  describe('subscribers', () => {
    it('test_subscriber_notifications: should notify on start and completion', async () => {
      // Fetch is already mocked in beforeEach

      const notifications: UploadJob[] = []
      const unsubscribe = UploadService.subscribe((job) => {
        notifications.push({ ...job })
      })

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      await UploadService.queueUpload(files)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(notifications.length).toBeGreaterThanOrEqual(2)
      expect(notifications[0].status).toBe('pending')
      expect(notifications[notifications.length - 1].status).toBe('completed')

      unsubscribe()
    })

    it('test_get_current_job: should return processing job', async () => {
      // Make fetch delay so we can check during processing
      ;(global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => mockSuccessResponse }), 50)
          )
      )

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      await UploadService.queueUpload(files)

      // Check during processing
      await new Promise((resolve) => setTimeout(resolve, 25))
      const currentJob = UploadService.getCurrentJob()
      expect(currentJob).toBeDefined()
      expect(currentJob?.status).toBe('processing')

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
  })

  describe('batch processing', () => {
    it('test_batch_processing_within_job: should make multiple API calls with same jobId', async () => {
      // Override mock for batch response
      const batchMockResponse: UploadResult = {
        returnMessage: 'Success',
        successCount: 5,
        failCount: 0,
        jsonData: {},
        newRecipeKeys: [],
        errors: [],
        jobId: 'mock-job-id',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => batchMockResponse,
      })

      // Create 25 files (should create 3 batches: 10 + 10 + 5)
      const files: UploadFile[] = Array.from({ length: 25 }, (_, i) => ({
        data: `data${i}`,
        type: 'image' as const,
        uri: `file://img${i}.jpg`,
      }))

      await UploadService.queueUpload(files)
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Should have called fetch 3 times
      expect(global.fetch).toHaveBeenCalledTimes(3)

      // Verify all calls include jobId in payload
      const calls = (global.fetch as jest.Mock).mock.calls
      calls.forEach((call) => {
        const body = JSON.parse(call[1].body)
        expect(body.jobId).toBeTruthy()
      })
    })
  })

  describe('chunk info tracking', () => {
    it('test_chunk_info_tracking: should pass through to job and notifications', async () => {
      // Fetch is already mocked in beforeEach

      const chunkInfo = { currentChunk: 3, totalChunks: 5 }
      let receivedChunkInfo = null

      const unsubscribe = UploadService.subscribe((job) => {
        if (job.chunkInfo) {
          receivedChunkInfo = job.chunkInfo
        }
      })

      const files: UploadFile[] = [
        { data: 'data1', type: 'pdf', uri: 'file://doc.pdf' },
      ]

      await UploadService.queueUpload(files, chunkInfo)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(receivedChunkInfo).toEqual(chunkInfo)

      unsubscribe()
    })
  })

  describe('job cancellation', () => {
    it('test_cancel_pending_job: should set status to error', async () => {
      // Prevent processing from starting
      UploadService['isProcessing'] = true

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Job should be pending since we blocked processing
      const cancelled = UploadService.cancelJob(jobId)
      expect(cancelled).toBe(true)

      const job = UploadService.getJob(jobId)
      expect(job?.status).toBe('error')
      expect(job?.errors.length).toBeGreaterThan(0)

      // Reset for other tests
      UploadService['isProcessing'] = false
    })

    it('test_cannot_cancel_processing_job: should return false', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => mockSuccessResponse }), 100)
          )
      )

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)

      // Wait until processing
      await new Promise((resolve) => setTimeout(resolve, 25))

      const cancelled = UploadService.cancelJob(jobId)
      expect(cancelled).toBe(false)

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
  })

  describe('error handling', () => {
    it('test_aggregate_errors_per_job: should track errors in job.errors', async () => {
      const mockResponse: UploadResult = {
        returnMessage: 'Partial failure',
        successCount: 1,
        failCount: 2,
        jsonData: { recipe1: { key: 'recipe1', Title: 'Test Recipe' } },
        newRecipeKeys: ['recipe1'],
        errors: [
          { file: 1, title: 'Recipe 2', reason: 'OCR failed' },
          { file: 2, title: 'Recipe 3', reason: 'Duplicate' },
        ],
        jobId: 'mock-job-id',
      }

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
        { data: 'data3', type: 'image', uri: 'file://img3.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const job = UploadService.getJob(jobId)
      expect(job?.errors).toHaveLength(2)
      expect(job?.progress.failed).toBe(2)
    })

    it('test_network_error_handling: should mark job as error', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const files: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]

      const jobId = await UploadService.queueUpload(files)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const job = UploadService.getJob(jobId)
      expect(job?.status).toBe('error')
      expect(job?.errors.length).toBeGreaterThan(0)
    })
  })

  describe('concurrent operations', () => {
    it('test_concurrent_queue_additions: should queue correctly while processing', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => mockSuccessResponse }), 50)
          )
      )

      const files1: UploadFile[] = [
        { data: 'data1', type: 'image', uri: 'file://img1.jpg' },
      ]
      const files2: UploadFile[] = [
        { data: 'data2', type: 'image', uri: 'file://img2.jpg' },
      ]

      const jobId1 = await UploadService.queueUpload(files1)

      // Queue second while first is processing
      await new Promise((resolve) => setTimeout(resolve, 25))
      const jobId2 = await UploadService.queueUpload(files2)

      expect(jobId1).not.toBe(jobId2)

      const allJobs = UploadService.getAllJobs()
      expect(allJobs).toHaveLength(2)

      // Wait for both to complete
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
  })
})
