/**
 * Tests for UploadPersistence Service
 * Persist upload queue state to AsyncStorage for app closure/reopen
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { UploadPersistence } from '../UploadPersistence'
import { UploadJob } from '@/types/upload'

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage')

// Mock fetch for S3 completion flags
global.fetch = jest.fn()

describe('UploadPersistence', () => {
  const mockJobs: UploadJob[] = [
    {
      id: 'job1',
      files: [],
      status: 'pending',
      progress: { total: 5, completed: 0, failed: 0 },
      errors: [],
      timestamp: Date.now(),
    },
    {
      id: 'job2',
      files: [],
      status: 'processing',
      progress: { total: 3, completed: 1, failed: 0 },
      errors: [],
      timestamp: Date.now(),
    },
    {
      id: 'job3',
      files: [],
      status: 'completed',
      progress: { total: 2, completed: 2, failed: 0 },
      errors: [],
      timestamp: Date.now(),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('saveQueue', () => {
    it('saves jobs to AsyncStorage successfully', async () => {
      ;(AsyncStorage.setItem as jest.Mock).mockResolvedValueOnce(undefined)

      await UploadPersistence.saveQueue(mockJobs)

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'upload_queue_state',
        expect.any(String)
      )

      // Verify the saved data can be parsed
      const savedData = (AsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      const parsed = JSON.parse(savedData)
      expect(parsed).toHaveLength(3)
    })

    it('filters old completed jobs, keeps recent 10', async () => {
      ;(AsyncStorage.setItem as jest.Mock).mockResolvedValueOnce(undefined)

      // Create 15 jobs: 12 completed, 3 pending
      const manyJobs: UploadJob[] = [
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `completed-${i}`,
          files: [],
          status: 'completed' as const,
          progress: { total: 1, completed: 1, failed: 0 },
          errors: [],
          timestamp: Date.now() - i * 1000, // Older timestamps
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `pending-${i}`,
          files: [],
          status: 'pending' as const,
          progress: { total: 1, completed: 0, failed: 0 },
          errors: [],
          timestamp: Date.now(),
        })),
      ]

      await UploadPersistence.saveQueue(manyJobs)

      const savedData = (AsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      const parsed = JSON.parse(savedData)

      // Should keep all 3 pending + most recent completed jobs up to 10 total
      expect(parsed.length).toBeLessThanOrEqual(10)

      // All pending jobs should be included
      const pendingCount = parsed.filter((j: UploadJob) => j.status === 'pending').length
      expect(pendingCount).toBe(3)
    })

    it('handles AsyncStorage errors gracefully', async () => {
      ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'))

      // Should not throw
      await expect(UploadPersistence.saveQueue(mockJobs)).resolves.not.toThrow()
    })
  })

  describe('loadQueue', () => {
    it('loads jobs from AsyncStorage successfully', async () => {
      const savedData = JSON.stringify(mockJobs)
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(savedData)

      const loaded = await UploadPersistence.loadQueue()

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('upload_queue_state')
      expect(loaded).toHaveLength(3)
      expect(loaded[0].id).toBe('job1')
    })

    it('returns empty array when no saved data', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null)

      const loaded = await UploadPersistence.loadQueue()

      expect(loaded).toEqual([])
    })

    it('handles parse errors gracefully', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('invalid json {')

      const loaded = await UploadPersistence.loadQueue()

      expect(loaded).toEqual([])
    })

    it('handles AsyncStorage errors gracefully', async () => {
      ;(AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'))

      const loaded = await UploadPersistence.loadQueue()

      expect(loaded).toEqual([])
    })
  })

  describe('clear', () => {
    it('clears AsyncStorage successfully', async () => {
      ;(AsyncStorage.removeItem as jest.Mock).mockResolvedValueOnce(undefined)

      await UploadPersistence.clear()

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('upload_queue_state')
    })

    it('handles AsyncStorage errors gracefully', async () => {
      ;(AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'))

      // Should not throw
      await expect(UploadPersistence.clear()).resolves.not.toThrow()
    })
  })

  describe('getCompletionFlags', () => {
    it('fetches multiple completion flags from S3', async () => {
      const flag1 = {
        jobId: 'job1',
        successCount: 5,
        failCount: 0,
        newRecipeKeys: ['recipe1', 'recipe2'],
      }
      const flag2 = {
        jobId: 'job2',
        successCount: 3,
        failCount: 1,
        newRecipeKeys: ['recipe3'],
      }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => flag1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => flag2,
        })

      const flags = await UploadPersistence.getCompletionFlags(['job1', 'job2'])

      expect(flags.size).toBe(2)
      expect(flags.get('job1')).toEqual(flag1)
      expect(flags.get('job2')).toEqual(flag2)
    })

    it('handles missing completion flags', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const flags = await UploadPersistence.getCompletionFlags(['missing-job'])

      expect(flags.size).toBe(0)
    })

    it('handles fetch errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const flags = await UploadPersistence.getCompletionFlags(['job1'])

      expect(flags.size).toBe(0)
    })
  })

  describe('deleteCompletionFlag', () => {
    it('deletes completion flag from S3', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      })

      await UploadPersistence.deleteCompletionFlag('job1')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('upload-status/job1.json'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('handles delete errors gracefully', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Delete error'))

      // Should not throw
      await expect(UploadPersistence.deleteCompletionFlag('job1')).resolves.not.toThrow()
    })

    it('ignores 404 errors for already-deleted flags', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // Should not throw
      await expect(UploadPersistence.deleteCompletionFlag('job1')).resolves.not.toThrow()
    })
  })
})
