import { ImageFile, Recipe } from './index';

// ============================================================================
// Configuration
// ============================================================================

/** Configuration constants for queue behavior */
export interface QueueConfig {
  /** Target initial queue size */
  INITIAL_QUEUE_SIZE: number;
  /** Trigger refill when queue drops below this */
  REFILL_THRESHOLD: number;
  /** Number of images to fetch per batch */
  BATCH_SIZE: number;
  /** Minimum queue size before blocking */
  MIN_QUEUE_SIZE: number;
  /** Swipe animation duration in ms */
  ANIMATION_DURATION: number;
}

// ============================================================================
// Generic Queue Types
// ============================================================================

/**
 * Generic state for a prefetch queue.
 * @template T - Type of items in the queue (default: ImageFile)
 */
export interface QueueState<T = ImageFile> {
  /** Prefetched items ready for display */
  queue: T[];
  /** Remaining unfetched item keys */
  itemKeyPool: string[];
  /** Is a batch fetch in progress? */
  isRefilling: boolean;
}

/**
 * Generic result of a batch fetch operation.
 * @template T - Type of fetched items (default: ImageFile)
 */
export interface BatchFetchResult<T = ImageFile> {
  /** Successfully fetched items */
  images: T[];
  /** Keys that failed to fetch */
  failedKeys: string[];
}

// ============================================================================
// Image Queue Specific Types
// ============================================================================

/** State maintained by ImageQueueService */
export interface ImageQueueState extends QueueState<ImageFile> {
  /** Alias for itemKeyPool for backwards compatibility */
  recipeKeyPool: string[];
}

/**
 * Return value of useImageQueue hook.
 * Provides access to image queue state and actions.
 */
export interface ImageQueueHook {
  // Queue state
  /** Currently displayed image */
  currentImage: ImageFile | null;
  /** Next image in queue (for preload/animation) */
  nextImage: ImageFile | null;
  /** Initial load in progress */
  isLoading: boolean;
  /** Current queue size (for debugging/display) */
  queueLength: number;

  // Queue actions
  /** Advance to next image (call on swipe left) */
  advanceQueue: () => void;
  /** Reset queue (call on filter change) */
  resetQueue: () => Promise<void>;
  /** Inject new recipes into queue at high priority */
  injectRecipes: (recipeKeys: string[]) => Promise<void>;

  // Image picker modal state
  /** Recipe awaiting image selection */
  pendingRecipe: Recipe | null;
  /** Whether image picker modal should be visible */
  showImagePickerModal: boolean;
  /** Clear pending recipe state */
  resetPendingRecipe: () => void;
  /** Handle image selection confirmation */
  onConfirmImage: (imageUrl: string) => Promise<void>;
  /** Handle recipe deletion from picker */
  onDeleteRecipe: () => Promise<void>;
}

// ============================================================================
// Type Guards
// ============================================================================

/** Check if a batch fetch result has any successful fetches */
export function hasFetchedImages<T>(result: BatchFetchResult<T>): boolean {
  return result.images.length > 0;
}

/** Check if all requested items failed to fetch */
export function allFetchesFailed<T>(result: BatchFetchResult<T>, requestedCount: number): boolean {
  return result.failedKeys.length === requestedCount && result.images.length === 0;
}
