import React, { useEffect } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as DocumentPicker from 'expo-document-picker'
import { UploadService } from '@/services/UploadService'
import { UploadFile } from '@/types/upload'
import { ToastQueue } from '@/components/Toast'

/**
 * Resize image to max dimensions and return base64
 */
export const resizeImage = async (uri: string, maxSize: number): Promise<string | undefined> => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize } }],  // Preserve aspect ratio
    { base64: true, compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  )
  return manipulatorResult.base64
}

/**
 * Split PDF into chunks of specified page size
 * @param pdfUri - URI of the PDF file
 * @param chunkSize - Number of pages per chunk (default: 20)
 * @returns Array of base64-encoded PDF chunks
 */
export const pdfToBase64 = async (pdfUri: string): Promise<string> => {
  const response = await fetch(pdfUri)
  if (!response.ok) {
    throw new Error(`Failed to read PDF: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()

  // Convert to base64 using chunked approach to avoid O(n²) string concat
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

/**
 * Select and upload multiple files (images and PDFs)
 * Handles file validation, PDF chunking, and background upload
 */
export const selectAndUploadImage = async (
  setUploadVisible: (visible: boolean) => void
): Promise<void> => {
  // Constants
  const IMAGE_MAX_SIZE_MB = 10
  const IMAGE_MAX_SIZE_BYTES = IMAGE_MAX_SIZE_MB * 1024 * 1024
  const PDF_MAX_SIZE_MB = 50
  const PDF_MAX_SIZE_BYTES = PDF_MAX_SIZE_MB * 1024 * 1024

  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Sorry, we need media library permissions to select files.'
    )
    setUploadVisible(false)
    return
  }

  // Launch document picker for multiple files
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    multiple: true,
    copyToCacheDirectory: true,
  })

  // Handle cancellation
  if (result.canceled || !result.assets || result.assets.length === 0) {
    setUploadVisible(false)
    return
  }

  // Process files
  const files: UploadFile[] = []
  let skippedFiles = 0

  for (const asset of result.assets) {
    try {
      // Validate and process images
      if (asset.mimeType?.startsWith('image/')) {
        if (asset.size && asset.size > IMAGE_MAX_SIZE_BYTES) {
          const sizeMB = Math.round(asset.size / 1024 / 1024)
          Alert.alert(
            'File Too Large',
            `Image '${asset.name}' is too large (${sizeMB}MB). Max size is ${IMAGE_MAX_SIZE_MB}MB. Skipping this file.`
          )
          skippedFiles++
          continue
        }

        const base64 = await resizeImage(asset.uri, 2000)
        if (base64) {
          files.push({
            data: base64,
            type: 'image',
            uri: asset.uri,
          })
        }
      } else if (asset.mimeType === 'application/pdf') {
        // Validate PDF size
        if (asset.size && asset.size > PDF_MAX_SIZE_BYTES) {
          const sizeMB = Math.round(asset.size / 1024 / 1024)
          Alert.alert(
            'File Too Large',
            `PDF '${asset.name}' is too large (${sizeMB}MB). Max size is ${PDF_MAX_SIZE_MB}MB. Skipping this file.`
          )
          skippedFiles++
          continue
        }

        const base64 = await pdfToBase64(asset.uri)
        files.push({
          data: base64,
          type: 'pdf',
          uri: asset.uri,
        })
      }
    } catch {
      Alert.alert('Error', `Failed to process file '${asset.name}'. Skipping.`)
      skippedFiles++
    }
  }

  // Show summary if files were skipped
  if (skippedFiles > 0 && files.length > 0) {
    Alert.alert(
      'Files Skipped',
      `Skipped ${skippedFiles} oversized file(s). Uploading ${files.length} files.`
    )
  }

  // Check if any files to upload
  if (files.length === 0) {
    Alert.alert('No Files', 'No valid files to upload.')
    setUploadVisible(false)
    return
  }

  // Start upload in background (non-blocking)
  UploadService.queueUpload(files)

  // Show processing toast
  ToastQueue.show('Processing...')

  // Close modal immediately
  setUploadVisible(false)
}

type UploadFilesProps = {
  setUploadVisible: (visible: boolean) => void
}

const UploadFiles: React.FC<UploadFilesProps> = ({
  setUploadVisible,
}) => {
  useEffect(() => {
    const initiateUpload = async () => {
      try {
        await selectAndUploadImage(setUploadVisible)
      } catch {
        // Error handled by Alert in selectAndUploadImage
      }
    }
    initiateUpload()
  }, [setUploadVisible])

  return null
}

export default UploadFiles
