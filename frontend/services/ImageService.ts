import { ImageFile } from '@/types';

const CLOUDFRONT_BASE_URL = process.env.EXPO_PUBLIC_CLOUDFRONT_BASE_URL;

// Map of bundled starter images (keys 10000-10004)
// These are served locally for instant loading before S3 is available
const STARTER_IMAGES: Record<string, number> = {
  '10000': require('@/assets/starter_data/10000.jpg'),
  '10001': require('@/assets/starter_data/10001.jpg'),
  '10002': require('@/assets/starter_data/10002.jpg'),
  '10003': require('@/assets/starter_data/10003.jpg'),
  '10004': require('@/assets/starter_data/10004.jpg'),
};

export class ImageService {
  /**
   * Checks if a recipe key has a bundled local image
   */
  static hasLocalImage(recipeKey: string): boolean {
    return recipeKey in STARTER_IMAGES;
  }

  /**
   * Gets the local image source for a recipe key
   * Returns the require() result which can be used directly in Image source
   */
  static getLocalImage(recipeKey: string): number | null {
    return STARTER_IMAGES[recipeKey] || null;
  }

  /**
   * Fetches an image file from S3/CloudFront or returns local bundled image
   * Local images are returned as data URIs for consistency with blob URLs
   */
  static async getImageFromS3(fileName: string): Promise<string> {
    // Extract recipe key from filename (e.g., "images/1.jpg" -> "1")
    const recipeKey = this.getRecipeKeyFromFileName(fileName);

    // Check if this is a starter image that's bundled locally
    if (this.hasLocalImage(recipeKey)) {
      // For bundled images, we need to resolve the asset URI
      // The require() returns a number (asset ID) in React Native
      // We'll use Asset.fromModule to get the actual URI
      try {
        const { Asset } = await import('expo-asset');
        const asset = Asset.fromModule(STARTER_IMAGES[recipeKey]);
        await asset.downloadAsync();
        return asset.localUri || asset.uri;
      } catch {
        // Fallback: try fetching from S3 if local asset loading fails
      }
    }

    // Fetch from CloudFront/S3
    const url = `${CLOUDFRONT_BASE_URL}/${fileName}`;

    try {

      const response = await fetch(url);

      if (!response.ok) {

        const errorText = await response.text();

        throw new Error(`Failed to fetch file from CloudFront. Status: ${response.status}`);
      }

      const fileBody = await response.blob();

      // Create object URL for web environments
      if (typeof window !== 'undefined' && window.URL && window.URL.createObjectURL) {
        return window.URL.createObjectURL(fileBody);
      }

      // For React Native, you might need different handling
      // This is a fallback that may need platform-specific implementation
      return '';
    } catch (error) {

      throw error;
    }
  }

  /**
   * Converts a recipe key to its image filename
   */
  static getImageFileName(recipeKey: string): string {
    return `images/${recipeKey}.jpg`;
  }

  /**
   * Extracts recipe key from image filename
   */
  static getRecipeKeyFromFileName(fileName: string): string {
    return fileName.replace('images/', '').replace('.jpg', '');
  }

  /**
   * Preloads multiple images for better user experience
   */
  static async preloadImages(recipeKeys: string[]): Promise<ImageFile[]> {
    const imagePromises = recipeKeys.map(async (key) => {
      try {
        const fileName = this.getImageFileName(key);
        const imageUrl = await this.getImageFromS3(fileName);
        return {
          filename: fileName,
          file: imageUrl,
        };
      } catch (error) {

        return null;
      }
    });

    const results = await Promise.allSettled(imagePromises);
    return results
      .filter((result): result is PromiseFulfilledResult<ImageFile | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value as ImageFile);
  }

  /**
   * Processes base64 image for upload
   */
  static processImageForUpload(imageUri: string): string {
    // Remove data URL prefix if present
    if (imageUri.startsWith('data:image')) {
      const base64Index = imageUri.indexOf(',');
      return imageUri.substring(base64Index + 1);
    }
    return imageUri;
  }

  /**
   * Creates a queue of images to fetch
   */
  static createImageQueue(recipeKeys: string[], initialCount: number = 3): string[] {
    return recipeKeys.slice(0, initialCount).map(key => this.getImageFileName(key));
  }
}