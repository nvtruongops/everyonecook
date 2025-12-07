/**
 * Background Service
 * Handles background image upload via presigned URLs
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

export const backgroundService = {
  /**
   * Upload background image using presigned URL
   * @param file - Image file to upload
   * @param token - Auth token
   * @returns CloudFront URL of uploaded background
   */
  async uploadBackground(file: File, token: string): Promise<string> {
    // Step 1: Get presigned URL
    const presignedResponse = await fetch(`${API_BASE_URL}/users/profile/background/presigned`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        file_type: file.type,
        file_size: file.size,
      }),
    });

    if (!presignedResponse.ok) {
      const error = await presignedResponse.json();
      throw new Error(error.error || 'Failed to get presigned URL');
    }

    const { data } = await presignedResponse.json();
    const { upload_url, background_url } = data;

    // Step 2: Upload file to S3
    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload background to S3');
    }

    return background_url;
  },

  /**
   * Get background URL from user profile
   * @param userId - User ID
   * @param token - Auth token
   * @returns Background URL or null
   */
  async getBackground(userId: string, token: string): Promise<string | null> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const { data } = await response.json();
    return data?.profile?.background_url || null;
  },

  /**
   * Remove background (set to null)
   * @param token - Auth token
   */
  async removeBackground(token: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        background_url: null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove background');
    }
  },

  /**
   * Alias for removeBackground
   * @deprecated Use removeBackground instead
   */
  async deleteBackground(userId: string, token: string): Promise<void> {
    return this.removeBackground(token);
  },
};
