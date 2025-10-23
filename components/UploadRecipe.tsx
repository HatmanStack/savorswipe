import React, { useEffect } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { EncodingType } from 'expo-file-system'
import { PDFDocument } from 'pdf-lib'
import { UploadService } from '@/services/UploadService'
import { UploadFile } from '@/types/upload'

/**
 * Resize image to max dimensions and return base64
 */
export const resizeImage = async (uri: string, maxSize: number): Promise<string | undefined> => {
  const manipulatorResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  )
  return manipulatorResult.base64
}

/**
 * Split PDF into chunks of specified page size
 * @param pdfUri - URI of the PDF file
 * @param chunkSize - Number of pages per chunk (default: 20)
 * @returns Array of base64-encoded PDF chunks
 */
export const splitPDFIntoChunks = async (
  pdfUri: string,
  chunkSize: number = 20
): Promise<string[]> => {
  const PDF_MAX_PAGES = chunkSize

  // Read PDF file as base64
  const base64 = await FileSystem.readAsStringAsync(pdfUri, {
    encoding: EncodingType.Base64,
  })

  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const arrayBuffer = bytes.buffer

  // Load PDF
  const pdfDoc = await PDFDocument.load(arrayBuffer)
  const pageCount = pdfDoc.getPageCount()

  // If small PDF, return as single chunk
  if (pageCount <= PDF_MAX_PAGES) {
    const singleChunkBase64 = await pdfDoc.saveAsBase64()
    return [singleChunkBase64]
  }

  // Split into multiple chunks
  const numChunks = Math.ceil(pageCount / PDF_MAX_PAGES)
  const chunks: string[] = []

  for (let i = 0; i < numChunks; i++) {
    const chunkDoc = await PDFDocument.create()
    const startPage = i * PDF_MAX_PAGES
    const endPage = Math.min((i + 1) * PDF_MAX_PAGES, pageCount)

    // Copy pages to chunk
    const pageIndices = Array.from(
      { length: endPage - startPage },
      (_, idx) => startPage + idx
    )
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices)
    copiedPages.forEach((page) => chunkDoc.addPage(page))

    // Save chunk as base64
    const chunkBase64 = await chunkDoc.saveAsBase64()
    chunks.push(chunkBase64)
  }

  return chunks
}

/**
 * Select and upload multiple files (images and PDFs)
 * Handles file validation, PDF chunking, and background upload
 */
export const selectAndUploadImage = async (
  setUploadMessage: (result: any) => void,
  setUploadVisible: (visible: boolean) => void
): Promise<void> => {
  // Constants
  const IMAGE_MAX_SIZE_MB = 10
  const IMAGE_MAX_SIZE_BYTES = IMAGE_MAX_SIZE_MB * 1024 * 1024

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
        // Split PDF into chunks
        const chunks = await splitPDFIntoChunks(asset.uri, 20)
        for (const chunk of chunks) {
          files.push({
            data: chunk,
            type: 'pdf',
            uri: asset.uri,
          })
        }
      }
    } catch (error) {
      console.error(`Error processing file ${asset.name}:`, error)
      Alert.alert('Error', `Failed to process file '${asset.name}'. Skipping.`)
      skippedFiles++
    }
  }

  // Estimate processing time and warn if excessive
  const pdfChunks = files.filter((f) => f.type === 'pdf').length
  if (pdfChunks > 0) {
    // Formula: chunks × 20 recipes/chunk × 53 seconds/recipe ÷ 60 ÷ 3 workers
    const estimatedMinutes = Math.ceil((pdfChunks * 20 * 53) / 60 / 3)
    if (estimatedMinutes > 10) {
      const userConfirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Long Processing Time',
          `This upload contains ${pdfChunks} PDF chunks (~${estimatedMinutes} minutes to process). Large uploads may take a long time. Continue?`,
          [
            {
              text: 'Continue',
              onPress: () => resolve(true),
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(false),
            },
          ]
        )
      })

      if (!userConfirmed) {
        // User cancelled
        setUploadVisible(false)
        return
      }
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

  // Close modal immediately
  setUploadVisible(false)
}

type UploadFilesProps = {
  setUploadMessage: (message: any) => void
  setUploadVisible: (visible: boolean) => void
}

const UploadFiles: React.FC<UploadFilesProps> = ({
  setUploadMessage,
  setUploadVisible,
}) => {
  useEffect(() => {
    const initiateUpload = async () => {
      await selectAndUploadImage(setUploadMessage, setUploadVisible)
    }
    initiateUpload()
  }, [setUploadMessage, setUploadVisible])

  return null
}

export default UploadFiles
