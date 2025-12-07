/**
 * Custom Section Model - Type definitions for custom profile sections
 *
 * @module models/custom-section
 * @see .kiro/specs/project-restructure/user-profile-design.md - Custom Sections
 */

/**
 * Custom section entity
 * Stored as: PK=USER#{userId}, SK=CUSTOM_SECTION#{sectionId}
 */
export interface CustomSection {
  sectionId: string;
  title: string;
  description?: string;
  privacy: 'public' | 'friends' | 'private';
  order: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Custom field entity
 * Stored as: PK=USER#{userId}, SK=CUSTOM_FIELD#{sectionId}#{fieldId}
 */
export interface CustomField {
  fieldId: string;
  sectionId: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date';
  value: string | boolean | null;
  privacy: 'public' | 'friends' | 'private';
  required: boolean;
  order: number;
  options?: string[]; // For select type
  createdAt: number;
  updatedAt: number;
}

/**
 * Create section request
 */
export interface CreateSectionRequest {
  title: string;
  description?: string;
  privacy?: 'public' | 'friends' | 'private';
}

/**
 * Update section request
 */
export interface UpdateSectionRequest {
  title?: string;
  description?: string;
  privacy?: 'public' | 'friends' | 'private';
  order?: number;
}

/**
 * Create field request
 */
export interface CreateFieldRequest {
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date';
  value?: string | boolean | null;
  privacy?: 'public' | 'friends' | 'private';
  required?: boolean;
  order?: number;
  options?: string[];
}

/**
 * Update field request
 */
export interface UpdateFieldRequest {
  label?: string;
  type?: 'text' | 'textarea' | 'select' | 'checkbox' | 'date';
  value?: string | boolean | null;
  privacy?: 'public' | 'friends' | 'private';
  required?: boolean;
  order?: number;
  options?: string[];
}

/**
 * Custom profile response (aggregated sections and fields)
 */
export interface CustomProfileResponse {
  userId: string;
  sections: CustomSectionWithFields[];
}

/**
 * Section with nested fields
 */
export interface CustomSectionWithFields extends CustomSection {
  fields: CustomField[];
}
