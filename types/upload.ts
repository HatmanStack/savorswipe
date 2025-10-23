/**
 * Upload Queue System Type Definitions
 *
 * Defines types for the job-based upload queue system with:
 * - Multiple concurrent upload jobs
 * - Per-job progress tracking
 * - Chunk-level progress visibility for large PDFs
 * - Detailed error reporting
 */

export type UploadState = 'pending' | 'processing' | 'completed' | 'error'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'error'

/**
 * Individual upload job in the queue
 * Each job represents one upload request (potentially containing multiple files)
 */
export interface UploadJob {
  id: string                // UUID for job tracking
  files: UploadFile[]       // Files in this job
  status: JobStatus         // Job-specific status
  progress: JobProgress     // Current progress
  result?: UploadResult     // Result when completed
  errors: UploadError[]     // Errors for this job
  timestamp: number         // Creation timestamp
  chunkInfo?: ChunkInfo     // Optional chunk tracking for large PDFs
}

/**
 * Chunk tracking for progress visibility
 * Enables "Processing chunk 3 of 5..." messages for large PDF uploads
 */
export interface ChunkInfo {
  currentChunk: number      // Current chunk being processed
  totalChunks: number       // Total chunks for this upload
}

/**
 * Progress tracking per job
 */
export interface JobProgress {
  total: number             // Total files in job
  completed: number         // Files completed
  failed: number            // Files failed
}

/**
 * Individual file to be uploaded
 */
export interface UploadFile {
  data: string              // Base64-encoded file data
  type: 'image' | 'pdf'     // File type
  uri: string               // Original file URI for reference
  chunkIndex?: number       // Optional: which chunk of PDF (for large PDFs)
}

/**
 * Result from backend Lambda function
 */
export interface UploadResult {
  returnMessage: string
  successCount: number
  failCount: number
  jsonData: Record<string, any>
  newRecipeKeys: string[]
  errors: UploadError[]
  encodedImages?: string    // Legacy support for single uploads
  jobId: string             // Job ID from backend for completion flag tracking
}

/**
 * Standardized error format
 * Note: 'file' field is REQUIRED (standardized from backend)
 */
export interface UploadError {
  file: number              // File index (REQUIRED - standardized from backend)
  title: string             // Recipe title
  reason: string            // Error reason/message
}

/**
 * Callback for job-specific notifications
 * Receives full job object for context
 */
export type JobStatusCallback = (job: UploadJob) => void

/**
 * Callback for upload status changes
 * Updated signature for job-based system
 */
export type UploadStatusCallback = (job: UploadJob) => void
