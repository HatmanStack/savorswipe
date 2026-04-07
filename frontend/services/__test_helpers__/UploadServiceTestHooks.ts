/**
 * UploadService Test Hooks
 *
 * Test-only helpers for mutating UploadService internal state. The underlying
 * accessor is gated on `__DEV__` in UploadService.ts, so importing this module
 * from a production bundle would no-op (the accessor is undefined).
 *
 * Tests should import from here, not UploadService directly.
 */
import { __UPLOAD_SERVICE_INTERNALS__ } from '../UploadService'

function getInternals() {
  if (!__UPLOAD_SERVICE_INTERNALS__) {
    throw new Error(
      'UploadService test hooks are only available when __DEV__ is true'
    )
  }
  return __UPLOAD_SERVICE_INTERNALS__
}

export function setTestApiUrl(url: string | null): void {
  getInternals().setTestApiUrl(url)
}

export function setProcessingForTests(value: boolean): void {
  getInternals().setProcessing(value)
}

export async function resetUploadServiceForTests(): Promise<void> {
  await getInternals().reset()
}
