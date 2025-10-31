import { ImageFile, Recipe } from './index';

// Configuration constants for queue behavior
export interface QueueConfig {
  INITIAL_QUEUE_SIZE: number;        // Target: 15
  REFILL_THRESHOLD: number;           // Trigger refill at: 8
  BATCH_SIZE: number;                 // Fetch per batch: 5
  MIN_QUEUE_SIZE: number;             // Minimum before blocking: 3
  ANIMATION_DURATION: number;         // Swipe animation: 100ms
}

// State maintained by ImageQueueService
export interface QueueState {
  queue: ImageFile[];                 // Prefetched images
  recipeKeyPool: string[];            // Remaining unfetched recipe keys
  isRefilling: boolean;               // Is a batch fetch in progress?
}

// Return value of useImageQueue hook
export interface ImageQueueHook {
  currentImage: ImageFile | null;     // Currently displayed
  nextImage: ImageFile | null;        // Next in queue (for animation)
  isLoading: boolean;                 // Initial load in progress
  queueLength: number;                // Current queue size (for debugging)
  advanceQueue: () => void;           // Call on swipe left
  resetQueue: () => Promise<void>;    // Call on filter change
  injectRecipes: (recipeKeys: string[]) => Promise<void>;  // Inject new recipes into queue

  // Image picker modal state
  pendingRecipe: Recipe | null;       // Recipe awaiting image selection
  showImagePickerModal: boolean;      // Modal visibility flag
  resetPendingRecipe: () => void;     // Clear pending recipe state
}

// Result of a batch fetch operation
export interface BatchFetchResult {
  images: ImageFile[];                // Successfully fetched images
  failedKeys: string[];               // Recipe keys that failed to fetch
}
