import { ImageFile } from './index';

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

  // Image picker modal state (modal interactions handled by GlobalImagePicker)
  /** Whether image picker modal should be visible (used for swipe guard) */
  showImagePickerModal: boolean;
}

