import React, { useState, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useRecipe } from '@/context/RecipeContext';
import UploadImage from '@/components/UploadRecipe';
import { ThemedText } from '@/components/ThemedText';
import { ImageService } from '@/services';
import { Recipe } from '@/types';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  uploadCount: number;
  styles: Record<string, StyleProp<ViewStyle>>;
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
  
  const { setFirstFile, setAllFiles, jsonData, setJsonData } = useRecipe();

  useEffect(() => {
    if (uploadMessage) {
      setUploadText(uploadMessage.returnMessage);
      
      if (uploadMessage.returnMessage.includes('success')) {
        // Handle successful upload
        const existingKeys = new Set(Object.keys(jsonData || {}));
        const newKeys = new Set(Object.keys(uploadMessage.jsonData || {}));
        const difference = [...newKeys].filter((key) => !existingKeys.has(key));
        const sortedDifference = difference.sort((a, b) => Number(b) - Number(a));
        
        console.log('New recipes uploaded:', sortedDifference);
        
        setAllFiles(sortedDifference);
        setJsonData(uploadMessage.jsonData);
        
        if (sortedDifference.length > 0) {
          setFirstFile({
            filename: ImageService.getImageFileName(sortedDifference[0]),
            file: `data:image/jpeg;base64,${uploadMessage.encodedImages}`,
          });
        }
      }
      
      // Clear message after 2 seconds
      const timer = setTimeout(() => {
        setUploadText(null);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [uploadMessage, jsonData, setAllFiles, setJsonData, setFirstFile]);

  if (!visible) return null;

  return (
    <>
      {uploadText && (
        <ThemedText style={styles.uploadMessage}>{uploadText}</ThemedText>
      )}
      <UploadImage
        key={uploadCount}
        setUploadMessage={setUploadMessage}
        setUploadVisible={onClose}
      />
    </>
  );
};