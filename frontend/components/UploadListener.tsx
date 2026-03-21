/**
 * UploadListener Component
 *
 * Persistent listener for upload completions that updates RecipeContext
 * when new recipes are successfully added. This component is always mounted
 * in the root layout, ensuring it receives completion callbacks even if
 * the upload UI is closed. Also displays ErrorDetailModal for per-file
 * upload/OCR failure details.
 */

import React, { useState, useEffect } from 'react';
import { useRecipe } from '@/context/RecipeContext';
import { UploadService } from '@/services/UploadService';
import { UploadJob, UploadError } from '@/types/upload';
import { ErrorDetailModal } from '@/components/ErrorDetailModal';
import { ToastQueue } from '@/components/Toast';

export function UploadListener() {
  const { refetchRecipes } = useRecipe();
  const [errorDetails, setErrorDetails] = useState<UploadError[]>([]);
  const [errorModalVisible, setErrorModalVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = UploadService.subscribe((job: UploadJob) => {

      // Only handle completion events
      if (job.status !== 'completed' && job.status !== 'error') {
        return;
      }

      // Show error details if any files failed
      if (job.errors && job.errors.length > 0) {
        setErrorDetails(job.errors);
        // Show toast that's tappable to open error details
        ToastQueue.show(
          `${job.errors.length} file(s) failed. Tap for details.`,
          {
            onTap: () => setErrorModalVisible(true),
            tappable: true,
          }
        );
      }

      // Refetch recipes from S3 to get the latest data
      // This triggers useImageQueue's auto-detection for pending recipes
      // Refetch even on error in case some recipes succeeded
      if (job.result && job.result.successCount > 0) {
        refetchRecipes().catch((error) => {
          console.error('[UploadListener] Refetch failed:', error);
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refetchRecipes]);

  return (
    <ErrorDetailModal
      visible={errorModalVisible}
      errors={errorDetails}
      onClose={() => setErrorModalVisible(false)}
    />
  );
}
