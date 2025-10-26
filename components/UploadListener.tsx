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
  const { setJsonData } = useRecipe();

  useEffect(() => {
    const unsubscribe = UploadService.subscribe((job: UploadJob) => {
      // Only handle completion events
      if (job.status !== 'completed' && job.status !== 'error') {
        return;
      }

      // Update RecipeContext with new data
      if (job.result?.jsonData) {
        setJsonData(job.result.jsonData);
      }

      // Show toast notification
      const { completed, failed } = job.progress;
      let message: string;

      if (failed === 0) {
        message = `All ${completed} recipes added successfully!`;
      } else if (completed > 0) {
        message = `${completed} of ${completed + failed} recipes added. ${failed} failed.`;
      } else {
        message = `All ${failed} recipes failed.`;
      }

      ToastQueue.show(message);
    });

    return () => {
      unsubscribe();
    };
  }, [setJsonData]); // Removed jsonData from deps - only need setJsonData

  // This component doesn't render anything
  return null;
}
