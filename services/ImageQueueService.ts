import { ImageFile, S3JsonData, MealType } from '@/types';
import { QueueConfig, BatchFetchResult } from '@/types/queue';
import { ImageService } from './ImageService';
import { RecipeService } from './RecipeService';

export class ImageQueueService {
  // Default configuration
  static readonly CONFIG: QueueConfig = {
    INITIAL_QUEUE_SIZE: 15,
    REFILL_THRESHOLD: 8,
    BATCH_SIZE: 5,
    MIN_QUEUE_SIZE: 3,
    ANIMATION_DURATION: 100,
  };

  /**
   * Fetches a batch of images in parallel
   * @param recipeKeys - Array of recipe keys to fetch
   * @param batchSize - Number of images to fetch (default: 5)
   * @returns Promise with successful images and failed keys
   */
  static async fetchBatch(
    recipeKeys: string[],
    batchSize: number = this.CONFIG.BATCH_SIZE
  ): Promise<BatchFetchResult> {
    // Take only the first batchSize keys
    const keysToFetch = recipeKeys.slice(0, batchSize);

    // If no keys provided, return empty result
    if (keysToFetch.length === 0) {
      return { images: [], failedKeys: [] };
    }

    // Create promises for each image fetch with explicit typing
    const fetchPromises: Promise<{ filename: string; file: string; key: string }>[] = keysToFetch.map(async (key) => {
      const filename = ImageService.getImageFileName(key);
      const fileUrl = await ImageService.getImageFromS3(filename);
      return {
        filename,
        file: fileUrl,
        key, // Include key for error tracking
      };
    });

    // Use Promise.allSettled to handle partial failures
    const results = await Promise.allSettled<{ filename: string; file: string; key: string }>(fetchPromises);

    // Separate successful fetches from failures
    const images: ImageFile[] = [];
    const failedKeys: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { filename, file } = result.value;
        images.push({ filename, file });
      } else {
        // Track which key failed
        failedKeys.push(keysToFetch[index]);

      }
    });

    return { images, failedKeys };
  }

  /**
   * Determines if queue needs refilling
   * @param currentQueueLength - Current number of images in queue
   * @returns true if queue length <= REFILL_THRESHOLD
   */
  static shouldRefillQueue(currentQueueLength: number): boolean {
    return currentQueueLength <= this.CONFIG.REFILL_THRESHOLD;
  }

  /**
   * Revokes blob URLs to free memory
   * @param images - Array of ImageFile objects to clean up
   */
  static cleanupImages(images: ImageFile[]): void {
    images.forEach((image) => {
      try {
        // Only attempt to revoke if it's a blob URL
        if (image.file && image.file.startsWith('blob:')) {
          URL.revokeObjectURL(image.file);
        }
      } catch {
        // Silently handle errors - cleanup is best-effort
      }
    });
  }

  /**
   * Shuffles and filters recipe keys to create initial pool
   * @param jsonData - All recipe data
   * @param filters - Active meal type filters
   * @returns Shuffled array of recipe keys
   */
  static createRecipeKeyPool(
    jsonData: S3JsonData,
    filters: MealType[]
  ): string[] {
    // Filter recipes by meal type
    const filteredKeys = RecipeService.filterRecipesByMealType(jsonData, filters);

    // Shuffle the filtered keys
    const shuffledKeys = RecipeService.shuffleRecipeKeys(filteredKeys);

    return shuffledKeys;
  }
}
