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

export function UploadListener() {
  const { refetchRecipes } = useRecipe();

  useEffect(() => {
    const unsubscribe = UploadService.subscribe((job: UploadJob) => {
      // Only handle completion events
      if (job.status !== 'completed' && job.status !== 'error') {
        return;
      }

      // Refetch recipes from S3 to get the latest data
      // This triggers useImageQueue's auto-detection for pending recipes
      if (job.status === 'completed') {
        refetchRecipes();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refetchRecipes]);

  // This component doesn't render anything
  return null;
}
