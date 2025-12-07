/**
 * Custom Section Handlers
 *
 * Implements custom profile section operations:
 * - Get all sections with fields
 * - Create/Update/Delete sections
 * - Add/Update/Delete fields
 *
 * @module handlers/custom-section
 */

import {
  getCustomSections,
  createSection,
  updateSection,
  deleteSection,
  addField,
  updateField,
  deleteField,
} from '../services/custom-section.service';
import {
  CustomSectionWithFields,
  CustomSection,
  CustomField,
  CreateSectionRequest,
  UpdateSectionRequest,
  CreateFieldRequest,
  UpdateFieldRequest,
} from '../models/custom-section.model';

/**
 * Get all custom sections with fields
 */
export async function getCustomSectionsHandler(
  userId: string
): Promise<{ sections: CustomSectionWithFields[] }> {
  const sections = await getCustomSections(userId);
  return { sections };
}

/**
 * Create a new section
 */
export async function createSectionHandler(
  userId: string,
  request: CreateSectionRequest
): Promise<CustomSection> {
  // Validate
  if (!request.title || request.title.trim().length === 0) {
    throw new Error('Title is required');
  }
  if (request.title.length > 50) {
    throw new Error('Title must be less than 50 characters');
  }

  return await createSection(userId, request);
}

/**
 * Update a section
 */
export async function updateSectionHandler(
  userId: string,
  sectionId: string,
  request: UpdateSectionRequest
): Promise<CustomSection> {
  // Validate
  if (request.title !== undefined) {
    if (request.title.trim().length === 0) {
      throw new Error('Title cannot be empty');
    }
    if (request.title.length > 50) {
      throw new Error('Title must be less than 50 characters');
    }
  }

  return await updateSection(userId, sectionId, request);
}

/**
 * Delete a section
 */
export async function deleteSectionHandler(userId: string, sectionId: string): Promise<void> {
  await deleteSection(userId, sectionId);
}

/**
 * Add a field to a section
 */
export async function addFieldHandler(
  userId: string,
  sectionId: string,
  request: CreateFieldRequest
): Promise<CustomField> {
  // Validate - label and type are optional, default to 'text' type
  if (request.label && request.label.length > 100) {
    throw new Error('Label must be less than 100 characters');
  }

  // Set defaults if not provided
  const normalizedRequest: CreateFieldRequest = {
    ...request,
    label: request.label || 'Field',
    type: request.type || 'text',
  };

  const validTypes = ['text', 'textarea', 'select', 'checkbox', 'date'];
  if (!validTypes.includes(normalizedRequest.type!)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }

  return await addField(userId, sectionId, normalizedRequest);
}

/**
 * Update a field
 */
export async function updateFieldHandler(
  userId: string,
  sectionId: string,
  fieldId: string,
  request: UpdateFieldRequest
): Promise<CustomField> {
  // Validate
  if (request.label !== undefined) {
    if (request.label.trim().length === 0) {
      throw new Error('Label cannot be empty');
    }
    if (request.label.length > 100) {
      throw new Error('Label must be less than 100 characters');
    }
  }

  if (request.type !== undefined) {
    const validTypes = ['text', 'textarea', 'select', 'checkbox', 'date'];
    if (!validTypes.includes(request.type)) {
      throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }
  }

  return await updateField(userId, sectionId, fieldId, request);
}

/**
 * Delete a field
 */
export async function deleteFieldHandler(
  userId: string,
  sectionId: string,
  fieldId: string
): Promise<void> {
  await deleteField(userId, sectionId, fieldId);
}
