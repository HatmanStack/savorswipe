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
  console.log('[PDF] Converting PDF to base64, uri:', pdfUri)

  // Read PDF file as ArrayBuffer (works on both web and native)
  const response = await fetch(pdfUri)
  console.log('[PDF] Fetch response status:', response.status)
  const arrayBuffer = await response.arrayBuffer()
  console.log('[PDF] ArrayBuffer size:', arrayBuffer.byteLength)

  // Convert to base64
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  console.log('[PDF] Base64 length:', base64.length)

  return base64
}

/**
 * Select and upload multiple files (images and PDFs)
 * Handles file validation, PDF chunking, and background upload
 */
export const selectAndUploadImage = async (
  setUploadVisible: (visible: boolean) => void
): Promise<void> => {
  console.log('[UPLOAD] selectAndUploadImage started')
  // Constants
  const IMAGE_MAX_SIZE_MB = 10
  const IMAGE_MAX_SIZE_BYTES = IMAGE_MAX_SIZE_MB * 1024 * 1024

  // Request permissions
  console.log('[UPLOAD] Requesting permissions...')
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  console.log('[UPLOAD] Permission status:', status)
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Sorry, we need media library permissions to select files.'
    )
    setUploadVisible(false)
    return
  }

  // Launch document picker for multiple files
  console.log('[UPLOAD] Launching document picker...')
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    multiple: true,
    copyToCacheDirectory: true,
  })
  console.log('[UPLOAD] DocumentPicker result:', JSON.stringify(result, null, 2))

  // Handle cancellation
  if (result.canceled || !result.assets || result.assets.length === 0) {
    console.log('[UPLOAD] Cancelled or no assets')
    setUploadVisible(false)
    return
  }

  // Process files
  const files: UploadFile[] = []
  let skippedFiles = 0

  for (const asset of result.assets) {
    console.log('[UPLOAD] Processing asset:', asset.name, 'type:', asset.mimeType)
    try {
      // Validate image size (skip oversized images)
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

        // Resize and add image
        const base64 = await resizeImage(asset.uri, 2000)
        if (base64) {
          files.push({
            data: base64,
            type: 'image',
            uri: asset.uri,
          })
        }
      } else if (asset.mimeType === 'application/pdf') {
        console.log('[UPLOAD] Processing PDF...')
        // Convert PDF to base64 (backend handles page processing)
        const base64 = await pdfToBase64(asset.uri)
        console.log('[UPLOAD] PDF converted to base64')
        files.push({
          data: base64,
          type: 'pdf',
          uri: asset.uri,
        })
      }
    } catch (error) {
      console.error('[UPLOAD] Error processing file:', error)
      Alert.alert('Error', `Failed to process file '${asset.name}'. Skipping.`)
      skippedFiles++
    }
  }
  console.log('[UPLOAD] Total files to upload:', files.length)

  // Note: Time estimates removed - backend handles PDF processing

  // Show summary if files were skipped
  if (skippedFiles > 0 && files.length > 0) {
    Alert.alert(
      'Files Skipped',
      `Skipped ${skippedFiles} oversized file(s). Uploading ${files.length} files.`
    )
  }

  // Check if any files to upload
  if (files.length === 0) {
    console.log('[UPLOAD] No valid files to upload')
    Alert.alert('No Files', 'No valid files to upload.')
    setUploadVisible(false)
    return
  }

  // Start upload in background (non-blocking)
  console.log('[UPLOAD] Calling UploadService.queueUpload with', files.length, 'files')
  UploadService.queueUpload(files)
  console.log('[UPLOAD] queueUpload called')

  // Show processing toast
  ToastQueue.show('Processing...')

  // Close modal immediately
  console.log('[UPLOAD] Done, closing modal')
  setUploadVisible(false)
}

type UploadFilesProps = {
  setUploadVisible: (visible: boolean) => void
}

const UploadFiles: React.FC<UploadFilesProps> = ({
  setUploadVisible,
}) => {
  console.log('[UploadFiles] Component rendered')

  useEffect(() => {
    console.log('[UploadFiles] useEffect triggered')
    const initiateUpload = async () => {
      console.log('[UploadFiles] initiateUpload called')
      try {
        await selectAndUploadImage(setUploadVisible)
      } catch (error) {
        console.error('[UploadFiles] Error in selectAndUploadImage:', error)
      }
    }
    initiateUpload()
  }, [setUploadVisible])

  return null
}

export default UploadFiles
