/**
 * Profile Types
 */

export interface CustomProfile {
  userId: string;
  sections: Record<string, CustomSection>;
  customFieldsCount?: number; // Total fields count
}

export interface CustomSection {
  id: string;
  title: string;
  order: number;
  fields: Record<string, CustomField>;
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date';
  value: any;
  privacy: 'public' | 'friends' | 'private';
  required: boolean;
  order: number;
  options?: string[];
}

export interface CustomProfileManagerProps {
  userId: string;
  token: string;
  maxSections?: number;
  maxTotalFields?: number;
  onProfileUpdate?: (profile: CustomProfile) => void;
}

export interface DynamicFormBuilderProps {
  section: CustomSection;
  sectionId?: string;
  onFieldAdd: (field: CustomField) => void;
  onFieldUpdate: (fieldId: string, field: CustomField) => void;
  onFieldDelete: (fieldId: string) => void;
  onFieldReorder?: (fieldIds: string[]) => void;
  remainingFieldsCount?: number;
  maxFieldsPerSection?: number;
  maxFields?: number;
  readOnly?: boolean;
}

