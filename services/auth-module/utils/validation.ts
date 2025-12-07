/**
 * Validation Utilities
 *
 * @module utils/validation
 */

/**
 * Sanitize HTML/script tags from input
 *
 * @param input - Input string
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validate full name
 *
 * @param fullName - Full name
 * @throws Error if invalid
 */
export function validateFullName(fullName: string): void {
  if (fullName.length < 1 || fullName.length > 50) {
    throw new Error('Full name must be between 1 and 50 characters');
  }
}

/**
 * Validate bio
 *
 * @param bio - Bio text
 * @throws Error if invalid
 */
export function validateBio(bio: string): void {
  if (bio.length > 500) {
    throw new Error('Bio must be at most 500 characters');
  }
}

/**
 * Validate file type
 *
 * @param contentType - MIME type
 * @param allowedTypes - Allowed MIME types
 * @throws Error if invalid
 */
export function validateFileType(contentType: string, allowedTypes: string[]): void {
  if (!allowedTypes.includes(contentType)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
}

/**
 * Validate file size
 *
 * @param size - File size in bytes
 * @param maxSize - Maximum size in bytes
 * @throws Error if invalid
 */
export function validateFileSize(size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new Error(`File size exceeds maximum of ${maxSize / (1024 * 1024)} MB`);
  }
}
