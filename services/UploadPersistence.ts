/**
 * Upload Queue Persistence Service
 *
 * Persists upload queue state to AsyncStorage for restoration after app closure/reopen.
 * Checks S3 completion flags for jobs that finished while app was closed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { UploadJob, UploadError } from '@/types/upload'

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL

interface CompletionFlag {
  timestamp: number
  successCount: number
  failCount: number
  newRecipeKeys: string[]
  errors: UploadError[]
}

export class UploadPersistence {
  private static STORAGE_KEY = 'upload_queue_state'
  private static MAX_COMPLETED_JOBS = 10  // Keep only recent 10 completed jobs

  /**
   * Save upload queue to AsyncStorage
   * Filters to keep only recent completed jobs and all non-completed jobs
   */
  static async saveQueue(jobs: UploadJob[]): Promise<void> {
    try {
      // Filter jobs: keep all non-completed + recent 10 completed
      const nonCompleted = jobs.filter(j => j.status !== 'completed')
      const completed = jobs
        .filter(j => j.status === 'completed')
        .sort((a, b) => b.timestamp - a.timestamp)  // Most recent first
        .slice(0, this.MAX_COMPLETED_JOBS)

      const jobsToSave = [...nonCompleted, ...completed]

      const jsonString = JSON.stringify(jobsToSave)
      await AsyncStorage.setItem(this.STORAGE_KEY, jsonString)
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to save upload queue:', error)
      }
      // Don't throw - persistence is optional
    }
  }

  /**
   * Load upload queue from AsyncStorage
   */
  static async loadQueue(): Promise<UploadJob[]> {
    try {
      const jsonString = await AsyncStorage.getItem(this.STORAGE_KEY)

      if (!jsonString) {
        return []
      }

      const jobs = JSON.parse(jsonString) as UploadJob[]
      return jobs
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to load upload queue:', error)
      }
      return []
    }
  }

  /**
   * Clear upload queue from AsyncStorage
   */
  static async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to clear upload queue:', error)
      }
      // Don't throw - persistence is optional
    }
  }

  /**
   * Fetch completion flags from S3 for given job IDs
   * Returns map of jobId → completion data
   */
  static async getCompletionFlags(jobIds: string[]): Promise<Map<string, CompletionFlag>> {
    const results = new Map<string, CompletionFlag>()

    for (const jobId of jobIds) {
      try {
        const url = `${CLOUDFRONT_BASE_URL}/upload-status/${jobId}.json`
        const response = await fetch(url)

        if (response.ok) {
          const data = await response.json()
          results.set(jobId, data)
        }
        // Ignore 404s - file doesn't exist yet
      } catch (error) {
        if (__DEV__) {
          console.error(`Failed to fetch completion flag for ${jobId}:`, error)
        }
        // Continue to next job
      }
    }

    return results
  }

  /**
   * Delete completion flag from S3
   * Ignores errors (flag may already be deleted)
   */
  static async deleteCompletionFlag(jobId: string): Promise<void> {
    try {
      const url = `${CLOUDFRONT_BASE_URL}/upload-status/${jobId}.json`
      await fetch(url, {
        method: 'DELETE',
      })
    } catch (error) {
      // Ignore errors - flag may already be deleted or delete may not be supported
      if (__DEV__) {
        console.error(`Failed to delete completion flag for ${jobId}:`, error)
      }
    }
  }
}
