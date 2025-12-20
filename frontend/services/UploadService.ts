/**
 * Upload Queue Service
 *
 * Job queue manager for background uploads with sequential processing.
 * Manages multiple upload jobs, tracks progress, and notifies subscribers.
 */

import * as Crypto from 'expo-crypto'
import {
  UploadJob,
  UploadFile,
  UploadResult,
  JobStatusCallback,
  ChunkInfo,
} from '@/types/upload'
import { UploadPersistence } from './UploadPersistence'

export class UploadService {
  private static BATCH_SIZE: number = 10
  private static _testApiUrl: string | null = null // For testing purposes

  // Job queue state
  private static jobQueue: UploadJob[] = []
  private static currentJobId: string | null = null
  private static subscribers: Set<JobStatusCallback> = new Set()
  private static isProcessing: boolean = false

  /**
   * Test-only method to set API URL
   * @internal
   */
  static _setTestApiUrl(url: string | null): void {
    this._testApiUrl = url
  }

  /**
   * Queue a new upload job
   * Returns job ID immediately (non-blocking)
   *
   * @param files - Array of files to upload
   * @param chunkInfo - Optional chunk tracking info for large PDFs
   * @returns Job ID (UUID)
   */
  static async queueUpload(files: UploadFile[], chunkInfo?: ChunkInfo): Promise<string> {
    // Generate unique job ID
    const jobId = this.generateJobId()

    // Create job object
    const job: UploadJob = {
      id: jobId,
      files,
      status: 'pending',
      progress: {
        total: files.length,
        completed: 0,
        failed: 0,
      },
      errors: [],
      timestamp: Date.now(),
      chunkInfo,
    }

    // Add to queue
    this.jobQueue.push(job)

    // Notify subscribers
    this.notifySubscribers(job)

    // Start processing if not already running (don't await)
    if (!this.isProcessing) {
      this.processQueue().catch(() => {
        // Errors are handled within processJob and reported via job status
        // This catch prevents unhandled promise rejection if processQueue itself throws
        // isProcessing is reset in processQueue's finally block
      })
    }

    return jobId
  }

  /**
   * Get job by ID
   */
  static getJob(jobId: string): UploadJob | undefined {
    return this.jobQueue.find((job) => job.id === jobId)
  }

  /**
   * Get all jobs
   */
  static getAllJobs(): UploadJob[] {
    return [...this.jobQueue]
  }

  /**
   * Get currently processing job
   */
  static getCurrentJob(): UploadJob | undefined {
    if (this.currentJobId) {
      return this.getJob(this.currentJobId)
    }
    return undefined
  }

  /**
   * Subscribe to job status updates
   * Returns unsubscribe function
   */
  static subscribe(callback: JobStatusCallback): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Cancel a pending job
   * Returns true if cancelled, false if job is not pending
   */
  static cancelJob(jobId: string): boolean {
    const job = this.getJob(jobId)
    if (!job) return false

    if (job.status === 'pending') {
      job.status = 'error'
      job.errors.push({
        file: 0,
        title: 'Upload cancelled',
        reason: 'Cancelled by user',
      })
      this.notifySubscribers(job)
      return true
    }

    return false
  }

  /**
   * Process the job queue sequentially
   * Private method - called automatically by queueUpload
   */
  private static async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) return

    this.isProcessing = true

    try {
      while (true) {
        // Find next pending job
        const pendingJob = this.jobQueue.find((job) => job.status === 'pending')
        if (!pendingJob) break

        // Set as current job
        this.currentJobId = pendingJob.id

        // Update status to processing
        pendingJob.status = 'processing'
        this.notifySubscribers(pendingJob)

        // Process the job
        await this.processJob(pendingJob)

        // Clear current job
        this.currentJobId = null
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process a single job
   * Splits files into batches and calls API for each batch
   */
  private static async processJob(job: UploadJob): Promise<void> {
    const totalBatches = Math.ceil(job.files.length / this.BATCH_SIZE)
    const aggregatedResult: UploadResult = {
      returnMessage: '',
      successCount: 0,
      failCount: 0,
      jsonData: {},
      newRecipeKeys: [],
      errors: [],
      jobId: job.id,
    }

    // Process batches sequentially
    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * this.BATCH_SIZE
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE, job.files.length)
      const batch = job.files.slice(batchStart, batchEnd)

      try {
        // Call API for this batch
        const result = await this.callApi(job, batch)

        // Merge result into aggregated result
        aggregatedResult.successCount += result.successCount
        aggregatedResult.failCount += result.failCount
        aggregatedResult.jsonData = { ...aggregatedResult.jsonData, ...result.jsonData }
        aggregatedResult.newRecipeKeys.push(...result.newRecipeKeys)
        aggregatedResult.errors.push(...result.errors)

        // Update job progress and errors
        job.progress.completed += result.successCount
        job.progress.failed += result.failCount
        job.errors.push(...result.errors)

        // Notify subscribers of progress
        this.notifySubscribers(job)
      } catch (error) {
        // Batch failed - mark all files as failed
        job.progress.failed += batch.length
        aggregatedResult.failCount += batch.length  // Update aggregated count

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const batchError = {
          file: batchStart,
          title: `Batch ${i + 1}/${totalBatches}`,
          reason: errorMessage,
        }
        job.errors.push(batchError)
        aggregatedResult.errors.push(batchError)  // Add to aggregated errors

        // Notify subscribers of error
        this.notifySubscribers(job)
      }

      // Brief delay between batches
      if (i < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    // Set final result
    job.result = aggregatedResult

    // Update final status
    job.status = job.progress.failed === 0 ? 'completed' : 'error'

    // Notify subscribers of completion
    this.notifySubscribers(job)
  }

  private static POLL_INTERVAL = 2000 // Poll every 2 seconds
  private static MAX_POLL_ATTEMPTS = 300 // Max 10 minutes (300 * 2s)

  /**
   * Call API with batch of files
   */
  private static async callApi(job: UploadJob, files: UploadFile[]): Promise<UploadResult> {
    const rawApiUrl = this._testApiUrl || process.env.EXPO_PUBLIC_API_GATEWAY_URL
    if (!rawApiUrl) {
      throw new Error('EXPO_PUBLIC_API_GATEWAY_URL is not configured')
    }

    // Normalize URL to prevent double-slash issues
    const API_URL = rawApiUrl.replace(/\/+$/, '')
    const endpoint = `${API_URL}/recipe/upload`

    const payload = {
      files: files.map((f) => ({
        data: f.data,
        type: f.type,
      })),
      jobId: job.id,
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok && response.status !== 202) {
      const errorText = await response.text()
      throw new Error(`API returned status ${response.status}: ${errorText}`)
    }

    const initialResult = await response.json()

    // If status is 202 (Accepted), poll for completion
    if (response.status === 202 && initialResult.status === 'processing') {
      return await this.pollForCompletion(API_URL, job.id)
    }

    return initialResult as UploadResult
  }

  private static MAX_CONSECUTIVE_ERRORS = 5

  /**
   * Poll for job completion status
   */
  private static async pollForCompletion(apiUrl: string, jobId: string): Promise<UploadResult> {
    const statusEndpoint = `${apiUrl}/upload/status/${jobId}`
    let consecutiveErrors = 0

    for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, this.POLL_INTERVAL))

      try {
        const response = await fetch(statusEndpoint)

        if (!response.ok) {
          consecutiveErrors++
          if (consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            throw new Error(`Status check failed ${consecutiveErrors} times consecutively`)
          }
          continue
        }

        // Reset on success
        consecutiveErrors = 0

        const status = await response.json()

        if (status.status === 'completed') {
          return {
            returnMessage: `${status.successCount} recipes processed`,
            successCount: status.successCount || 0,
            failCount: status.failCount || 0,
            jsonData: status.jsonData || {},
            newRecipeKeys: status.newRecipeKeys || [],
            errors: status.errors || [],
            jobId: jobId,
          }
        }

        if (status.status === 'error') {
          throw new Error(status.error || 'Processing failed')
        }
      } catch (error) {
        // Continue polling on transient errors, but track consecutive failures
        if (error instanceof Error && error.message !== 'Processing failed') {
          consecutiveErrors++
          if (consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            throw new Error(`Polling failed after ${consecutiveErrors} consecutive errors`)
          }
          continue
        }
        throw error
      }
    }

    throw new Error('Processing timed out')
  }

  /**
   * Notify all subscribers of job status change
   */
  private static notifySubscribers(job: UploadJob): void {
    // Create copy to prevent mutations
    const jobCopy = { ...job }

    // Notify each subscriber
    this.subscribers.forEach((callback) => {
      try {
        callback(jobCopy)
      } catch (error) {}
    })

    // Persist queue state to AsyncStorage (errors silently ignored - persistence is optional)
    UploadPersistence.saveQueue(this.jobQueue).catch(() => {})
  }

  /**
   * Generate unique job ID
   */
  private static generateJobId(): string {
    return Crypto.randomUUID()
  }
}
