/**
 * Profile Service
 * Handles custom profile sections and fields management
 */

import { CustomProfile, CustomField, CustomSection } from '@/types/profile';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

class ProfileService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  /**
   * Get custom profile with sections and fields
   */
  async getCustomProfile(userId: string, token: string): Promise<CustomProfile | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/custom-sections`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch custom profile');
      }

      const { data } = await response.json();
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Save entire custom profile
   */
  async saveCustomProfile(profile: CustomProfile, token: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/users/profile/custom-sections`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(profile),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save custom profile');
    }
  }

  /**
   * Add custom field to section
   */
  async addCustomField(
    userId: string,
    sectionId: string,
    field: CustomField,
    token: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/users/profile/custom-sections/${sectionId}/fields`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(field),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add custom field');
    }
  }

  /**
   * Remove custom field from section
   */
  async removeCustomField(
    userId: string,
    sectionId: string,
    fieldId: string,
    token: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/users/profile/custom-sections/${sectionId}/fields/${fieldId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove custom field');
    }
  }

  // Section management
  validateSectionTitle(title: string): { valid: boolean; error?: string } {
    if (!title || title.trim().length === 0) {
      return { valid: false, error: 'Title is required' };
    }
    if (title.length > 50) {
      return { valid: false, error: 'Title must be less than 50 characters' };
    }
    return { valid: true };
  }

  /**
   * Create new custom section
   */
  async createSection(title: string, token?: string): Promise<CustomSection> {
    const authToken = token || this.token;
    const response = await fetch(`${API_BASE_URL}/users/profile/custom-sections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create section');
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Update section title
   */
  async updateSection(sectionId: string, title: string, token?: string): Promise<CustomSection> {
    const authToken = token || this.token;
    const response = await fetch(`${API_BASE_URL}/users/profile/custom-sections/${sectionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update section');
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Delete custom section
   */
  async deleteSection(sectionId: string, token?: string): Promise<void> {
    const authToken = token || this.token;
    const response = await fetch(`${API_BASE_URL}/users/profile/custom-sections/${sectionId}`, {
      method: 'DELETE',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete section');
    }
  }

  // Field management
  validateField(field: Partial<CustomField>): { valid: boolean; error?: string } {
    if (!field.label || field.label.trim().length === 0) {
      return { valid: false, error: 'Label is required' };
    }
    if (field.label.length > 100) {
      return { valid: false, error: 'Label must be less than 100 characters' };
    }
    return { valid: true };
  }

  /**
   * Add field to section
   */
  async addField(sectionId: string, field: CustomField, token?: string): Promise<CustomField> {
    const authToken = token || this.token;
    const response = await fetch(
      `${API_BASE_URL}/users/profile/custom-sections/${sectionId}/fields`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(field),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add field');
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Update field in section
   */
  async updateField(
    sectionId: string,
    fieldId: string,
    field: Partial<CustomField>,
    token?: string
  ): Promise<CustomField> {
    const authToken = token || this.token;
    const response = await fetch(
      `${API_BASE_URL}/users/profile/custom-sections/${sectionId}/fields/${fieldId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(field),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update field');
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Delete field from section
   */
  async deleteField(sectionId: string, fieldId: string, token?: string): Promise<void> {
    const authToken = token || this.token;
    const response = await fetch(
      `${API_BASE_URL}/users/profile/custom-sections/${sectionId}/fields/${fieldId}`,
      {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete field');
    }
  }
}

export default new ProfileService();
