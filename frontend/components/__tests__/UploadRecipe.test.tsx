/**
 * Tests for UploadRecipe Component
 * Multi-file upload with PDF chunking and size validation
 */

// Mock modules FIRST, before any imports
jest.mock('expo-image-picker')
jest.mock('expo-document-picker')
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}))
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))

// Now import modules
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { selectAndUploadImage, pdfToBase64 } from '../UploadRecipe'
import { UploadService } from '@/services/UploadService'
import { UploadFile } from '@/types/upload'

describe('UploadRecipe', () => {
  const mockSetUploadVisible = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    jest.spyOn(UploadService, 'queueUpload').mockResolvedValue('mock-job-id')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // Test 1: Verify permissions are requested
  it('test_requests_permissions: should request media library permissions', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled()
  })

  // Test 2: Handle denied permissions
  it('test_permissions_denied: should close modal and alert when permissions denied', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('permissions')
    )
    expect(mockSetUploadVisible).toHaveBeenCalledWith(false)
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled()
  })

  // Test 3: Launch multi-select document picker
  it('test_launches_multi_select_picker: should launch picker with multiple: true and correct types', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ['image/*', 'application/pdf'],
        multiple: true,
        copyToCacheDirectory: true,
      })
    )
  })

  // Test 4: Handle cancelled selection
  it('test_handles_cancelled_selection: should close modal when user cancels', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(mockSetUploadVisible).toHaveBeenCalledWith(false)
    expect(UploadService.queueUpload).not.toHaveBeenCalled()
  })

  // Test 5: Process multiple images
  it('test_processes_multiple_images: should create 3 UploadFile objects for 3 images under 10MB', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img1.jpg',
          name: 'img1.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024, // 5MB
        },
        {
          uri: 'file://img2.jpg',
          name: 'img2.jpg',
          mimeType: 'image/jpeg',
          size: 3 * 1024 * 1024, // 3MB
        },
        {
          uri: 'file://img3.jpg',
          name: 'img3.jpg',
          mimeType: 'image/jpeg',
          size: 8 * 1024 * 1024, // 8MB
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(UploadService.queueUpload).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', data: 'base64data' }),
        expect.objectContaining({ type: 'image', data: 'base64data' }),
        expect.objectContaining({ type: 'image', data: 'base64data' }),
      ])
    )
    expect(UploadService.queueUpload).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Object), expect.any(Object), expect.any(Object)])
    )
  })

  // Test 6: Validate image size (skip oversized)
  it('test_validates_image_size: should skip image > 10MB and show alert', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://large.jpg',
          name: 'large.jpg',
          mimeType: 'image/jpeg',
          size: 15 * 1024 * 1024, // 15MB - too large
        },
        {
          uri: 'file://small.jpg',
          name: 'small.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024, // 5MB - OK
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('large.jpg')
    )
    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('15MB')
    )
    expect(UploadService.queueUpload).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'image' })])
    )
    // Should only have 1 file (the small one)
    const uploadCall = (UploadService.queueUpload as jest.Mock).mock.calls[0][0]
    expect(uploadCall).toHaveLength(1)
  })

  // Test 7: Convert PDF to base64
  it('test_pdf_to_base64: should convert PDF file to base64 string', async () => {
    // Mock fetch to return PDF data
    const mockArrayBuffer = new ArrayBuffer(8)
    const mockResponse = {
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
    }
    global.fetch = jest.fn().mockResolvedValue(mockResponse)

    const result = await pdfToBase64('file://test.pdf')

    expect(global.fetch).toHaveBeenCalledWith('file://test.pdf')
    expect(typeof result).toBe('string')
  })

  // Test 8: PDF sent as single file (no chunking)
  it('test_pdf_sent_whole: should send PDF as single file to backend', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://test.pdf',
          name: 'test.pdf',
          mimeType: 'application/pdf',
          size: 2 * 1024 * 1024,
        },
      ],
    })

    // Mock fetch for pdfToBase64
    const mockArrayBuffer = new ArrayBuffer(8)
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
    })

    await selectAndUploadImage(mockSetUploadVisible)

    const uploadCall = (UploadService.queueUpload as jest.Mock).mock.calls[0][0]
    expect(uploadCall).toHaveLength(1) // Single PDF file, not chunked
    expect(uploadCall[0].type).toBe('pdf')
  })

  // Test 9: Large PDF processing (REMOVED - backend handles PDF processing now)
  it.skip('test_processes_cookbook: backend now handles PDF page processing', () => {
    // PDF chunking moved to backend - frontend sends whole PDF
  })

  // Test 10: Verify resizeImage is called
  it('test_resizes_images: should call resizeImage with 2000 max size', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img.jpg',
          name: 'img.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024,
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://img.jpg',
      [{ resize: { width: 2000 } }],
      { base64: true, compress: 0.7, format: 'jpeg' }
    )
  })

  // Test 11: Verify UploadService is called
  it('test_calls_upload_service: should call UploadService.uploadFiles with correct files array', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img.jpg',
          name: 'img.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024,
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(UploadService.queueUpload).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'base64data',
          type: 'image',
          uri: 'file://img.jpg',
        }),
      ])
    )
  })

  // Test 12: Modal closes immediately
  it('test_closes_modal_immediately: should call setUploadVisible(false) immediately', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img.jpg',
          name: 'img.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024,
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(mockSetUploadVisible).toHaveBeenCalledWith(false)
  })

  // Test 13: Mixed files (images + PDF)
  it('test_mixed_files: should process 2 images + 1 PDF correctly', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img1.jpg',
          name: 'img1.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024,
        },
        {
          uri: 'file://img2.jpg',
          name: 'img2.jpg',
          mimeType: 'image/jpeg',
          size: 3 * 1024 * 1024,
        },
        {
          uri: 'file://doc.pdf',
          name: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 2 * 1024 * 1024,
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64image',
    })

    // Mock fetch for PDF conversion
    const mockArrayBuffer = new ArrayBuffer(8)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
    })

    await selectAndUploadImage(mockSetUploadVisible)

    const uploadCall = (UploadService.queueUpload as jest.Mock).mock.calls[0][0]
    expect(uploadCall).toHaveLength(3) // 2 images + 1 PDF
    const imageFiles = uploadCall.filter((f: UploadFile) => f.type === 'image')
    const pdfFiles = uploadCall.filter((f: UploadFile) => f.type === 'pdf')
    expect(imageFiles).toHaveLength(2)
    expect(pdfFiles).toHaveLength(1)
  })

  // Test 14: Skipped files alert
  it('test_skipped_files_alert: should show alert for skipped oversized files', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://img1.jpg',
          name: 'img1.jpg',
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024, // 5MB - OK
        },
        {
          uri: 'file://img2.jpg',
          name: 'img2.jpg',
          mimeType: 'image/jpeg',
          size: 3 * 1024 * 1024, // 3MB - OK
        },
        {
          uri: 'file://large.jpg',
          name: 'large.jpg',
          mimeType: 'image/jpeg',
          size: 15 * 1024 * 1024, // 15MB - too large
        },
      ],
    })
    ;(ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      base64: 'base64data',
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Skipped 1 oversized')
    )
    const uploadCall = (UploadService.queueUpload as jest.Mock).mock.calls[0][0]
    expect(uploadCall).toHaveLength(2) // Only the 2 valid images
  })

  // Test 15: All files skipped
  it('test_all_files_skipped: should show alert and close modal when all files skipped', async () => {
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://large1.jpg',
          name: 'large1.jpg',
          mimeType: 'image/jpeg',
          size: 15 * 1024 * 1024, // 15MB
        },
        {
          uri: 'file://large2.jpg',
          name: 'large2.jpg',
          mimeType: 'image/jpeg',
          size: 20 * 1024 * 1024, // 20MB
        },
      ],
    })

    await selectAndUploadImage(mockSetUploadVisible)

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('No valid files to upload')
    )
    expect(mockSetUploadVisible).toHaveBeenCalledWith(false)
    expect(UploadService.queueUpload).not.toHaveBeenCalled()
  })

  // Test 16: Processing time warning (REMOVED - backend handles processing now)
  it.skip('test_processing_time_warning: processing time warnings removed', () => {
    // Backend now handles async processing with polling
  })

  // Test 17: User cancels long upload (REMOVED - backend handles processing now)
  it.skip('test_user_cancels_long_upload: processing time warnings removed', () => {
    // Backend now handles async processing with polling
  })
})
