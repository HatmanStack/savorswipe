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
  private static _testLambdaUrl: string | null = null // For testing purposes

  // Job queue state
  private static jobQueue: UploadJob[] = []
  private static currentJobId: string | null = null
  private static subscribers: Set<JobStatusCallback> = new Set()
  private static isProcessing: boolean = false

  /**
   * Test-only method to set Lambda URL
   * @internal
   */
  static _setTestLambdaUrl(url: string | null): void {
    this._testLambdaUrl = url
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
      this.processQueue().catch((error) => {})
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
   * Splits files into batches and calls Lambda for each batch
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
        // Call Lambda for this batch
        const result = await this.callLambda(job, batch)

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

  /**
   * Call Lambda function with batch of files
   */
  private static async callLambda(job: UploadJob, files: UploadFile[]): Promise<UploadResult> {
    const LAMBDA_URL = this._testLambdaUrl || process.env.EXPO_PUBLIC_LAMBDA_FUNCTION_URL
    if (!LAMBDA_URL) {
      throw new Error('EXPO_PUBLIC_LAMBDA_FUNCTION_URL is not configured')
    }

    const payload = {
      files: files.map((f) => ({
        data: f.data,
        type: f.type,
      })),
      jobId: job.id,
    }

    const response = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Lambda function returned status ${response.status}`)
    }

    const result = await response.json()
    return result as UploadResult
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

    // Persist queue state to AsyncStorage
    UploadPersistence.saveQueue(this.jobQueue).catch(error => {
      if (__DEV__) {}
    })
  }

  /**
   * Generate unique job ID
   */
  private static generateJobId(): string {
    return Crypto.randomUUID()
  }
}
