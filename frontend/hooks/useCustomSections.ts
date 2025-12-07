/**
 * useCustomSections Hook
 * Manages custom profile sections with API integration
 */

import { useState, useEffect, useCallback } from 'react';
import profileService from '@/services/profileService';

interface CustomField {
  fieldId: string;
  sectionId: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date';
  value: string | boolean | null;
  privacy: 'public' | 'friends' | 'private';
  required: boolean;
  order: number;
  options?: string[];
  createdAt: number;
  updatedAt: number;
}

interface CustomSection {
  sectionId: string;
  title: string;
  order: number;
  fields: CustomField[];
  createdAt: number;
  updatedAt: number;
}

interface UseCustomSectionsReturn {
  sections: CustomSection[];
  loading: boolean;
  error: string | null;
  createSection: (title: string) => Promise<void>;
  updateSection: (sectionId: string, title: string) => Promise<void>;
  deleteSection: (sectionId: string) => Promise<void>;
  addField: (sectionId: string, field: Partial<CustomField>) => Promise<void>;
  updateField: (sectionId: string, fieldId: string, updates: Partial<CustomField>) => Promise<void>;
  deleteField: (sectionId: string, fieldId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCustomSections(token: string | null): UseCustomSectionsReturn {
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sections
  const fetchSections = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud'}/users/profile/custom-sections`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch custom sections');
      }

      const { data } = await response.json();
      setSections(data.sections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Create section
  const createSection = useCallback(
    async (title: string) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.createSection(title, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create section';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  // Update section
  const updateSection = useCallback(
    async (sectionId: string, title: string) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.updateSection(sectionId, title, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update section';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  // Delete section
  const deleteSection = useCallback(
    async (sectionId: string) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.deleteSection(sectionId, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete section';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  // Add field
  const addField = useCallback(
    async (sectionId: string, field: Partial<CustomField>) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.addField(sectionId, field as any, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add field';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  // Update field
  const updateField = useCallback(
    async (sectionId: string, fieldId: string, updates: Partial<CustomField>) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.updateField(sectionId, fieldId, updates, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update field';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  // Delete field
  const deleteField = useCallback(
    async (sectionId: string, fieldId: string) => {
      if (!token) throw new Error('Not authenticated');

      try {
        setError(null);
        await profileService.deleteField(sectionId, fieldId, token);
        await fetchSections(); // Refresh
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete field';
        setError(message);
        throw err;
      }
    },
    [token, fetchSections]
  );

  return {
    sections,
    loading,
    error,
    createSection,
    updateSection,
    deleteSection,
    addField,
    updateField,
    deleteField,
    refresh: fetchSections,
  };
}
