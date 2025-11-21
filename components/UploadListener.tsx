/**
 * UploadListener Component
 *
 * Persistent listener for upload completions that updates RecipeContext
 * when new recipes are successfully added. This component is always mounted
 * in the root layout, ensuring it receives completion callbacks even if
 * the UploadModal is closed.
 */

import { useEffect } from 'react';
import { useRecipe } from '@/context/RecipeContext';
import { UploadService } from '@/services/UploadService';
import { UploadJob } from '@/types/upload';
import { ToastQueue } from '@/components/Toast';

export function UploadListener() {
  const { setJsonData, setPendingRecipeForPicker } = useRecipe();

  useEffect(() => {
    const unsubscribe = UploadService.subscribe((job: UploadJob) => {
      // Only handle completion events
      if (job.status !== 'completed' && job.status !== 'error') {
        return;
      }

      // Update RecipeContext with new data (merge, don't replace)
      if (job.result?.jsonData) {
        setJsonData((prevData) => ({
          ...prevData,
          ...job.result.jsonData
        }));

        // Check if any new recipes need image selection
        const newRecipes = Object.entries(job.result.jsonData);
        for (const [key, recipe] of newRecipes) {
          const needsImageSelection =
            Array.isArray(recipe.image_search_results) &&
            recipe.image_search_results.length > 0 &&
            !recipe.image_url;

          if (needsImageSelection) {
            // Trigger modal immediately for first pending recipe
            console.log('[UPLOAD] New recipe needs image selection:', key);
            setPendingRecipeForPicker({ ...recipe, key });
            break; // Only show modal for first pending recipe
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setJsonData, setPendingRecipeForPicker]);

  // This component doesn't render anything
  return null;
}
