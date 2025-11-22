import React, { useState, useEffect } from 'react';
import { useRecipe } from '@/context/RecipeContext';
import UploadImage from '@/components/UploadRecipe';
import { ThemedText } from '@/components/ThemedText';
import { Recipe } from '@/types';
import { UploadService } from '@/services/UploadService';
import { UploadJob, UploadError } from '@/types/upload';
import { ErrorDetailModal } from '@/components/ErrorDetailModal';
import { ToastQueue } from '@/components/Toast';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  uploadCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: Record<string, any>;
}

interface UploadMessageType {
  returnMessage: string;
  jsonData: Record<string, Recipe>;
  encodedImages: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  visible,
  onClose,
  uploadCount,
  styles
}) => {
  const [uploadMessage, setUploadMessage] = useState<UploadMessageType | null>(null);
  const [uploadText, setUploadText] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadJob | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<UploadError[]>([]);
  const [errorModalVisible, setErrorModalVisible] = useState(false);

  const { jsonData, setJsonData } = useRecipe();

  // Subscribe to UploadService status updates
  useEffect(() => {
    const unsubscribe = UploadService.subscribe((job: UploadJob) => {
      setUploadStatus(job);

      // Handle completion or error
      if (job.status === 'completed' || job.status === 'error') {
        const message = buildCompletionMessage(job);
        setToastMessage(message);
        setErrorDetails(job.errors);

        // Update RecipeContext with new data
        if (job.result?.jsonData) {
          setJsonData(job.result.jsonData);
        }
      }
    });

    return () => unsubscribe();
  }, [setJsonData]);

  // Legacy support for old upload flow
  useEffect(() => {
    if (uploadMessage) {
      setUploadText(uploadMessage.returnMessage);

      if (uploadMessage.returnMessage.includes('success')) {
        // Update jsonData with new recipes (image queue handles display)
        setJsonData(uploadMessage.jsonData);
      }

      // Clear message after 2 seconds
      const timer = setTimeout(() => {
        setUploadText(null);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [uploadMessage, jsonData, setJsonData]);

  // Helper function to build completion message
  const buildCompletionMessage = (job: UploadJob): string => {
    const { completed, failed } = job.progress;
    const total = job.progress.total;
    const newRecipeCount = job.result?.newRecipeKeys?.length || 0;

    if (failed === 0) {
      return `${completed} recipe${completed !== 1 ? 's' : ''} processed! ${newRecipeCount} new recipe${newRecipeCount !== 1 ? 's' : ''} ready to swipe.`;
    } else if (completed > 0) {
      return `${completed}/${total} succeeded, ${failed} failed. Tap to view errors.`;
    } else {
      return `Upload failed: ${failed}/${total} errors. Tap for details.`;
    }
  };

  // Handle toast tap
  const handleToastTap = () => {
    if (errorDetails.length > 0) {
      setErrorModalVisible(true);
    }
  };

  // Show toast imperatively when toastMessage changes
  useEffect(() => {
    if (toastMessage) {
      ToastQueue.show(toastMessage, {
        onTap: handleToastTap,
        tappable: errorDetails.length > 0,
      });
      setToastMessage(null); // Clear after showing
    }
  }, [toastMessage, errorDetails.length]);

  if (!visible) return null;

  return (
    <>
      {/* Legacy upload message */}
      {uploadText && (
        <ThemedText style={styles.uploadMessage}>{uploadText}</ThemedText>
      )}

      {/* Progress display during upload */}
      {uploadStatus?.status === 'processing' && (
        <ThemedText style={styles.uploadMessage}>
          Uploading... {uploadStatus.progress.completed}/{uploadStatus.progress.total}
        </ThemedText>
      )}

      {/* Error detail modal */}
      <ErrorDetailModal
        visible={errorModalVisible}
        errors={errorDetails}
        onClose={() => setErrorModalVisible(false)}
      />

      <UploadImage
        key={uploadCount}
        setUploadVisible={onClose}
      />
    </>
  );
};