# Custom Profile Components

This directory contains components for managing custom user profile sections and fields, enabling personalized AI recipe recommendations.

## Components

### CustomProfileManager

The main component for managing custom profile sections and fields.

**Props:**
- `userId: string` - The user's unique identifier
- `maxSections?: number` - Maximum number of sections allowed (default: 5)
- `maxTotalFields?: number` - Maximum total fields across all sections (default: 15)
- `onProfileUpdate?: (profile: CustomProfile) => void` - Callback when profile is updated

**Features:**
- Create, edit, and delete custom sections
- Drag and drop section reordering
- Field validation (30 char labels, 200 char values)
- Privacy controls for individual fields
- Real-time field and section counting
- Toast notifications for user feedback

### DynamicFormBuilder

A reusable component for managing fields within a section.

**Props:**
- `section: CustomSection` - The section containing fields
- `sectionId: string` - Unique identifier for the section
- `onFieldAdd: (field: CustomField) => void` - Callback for adding fields
- `onFieldUpdate: (fieldId: string, field: CustomField) => void` - Callback for updating fields
- `onFieldDelete: (fieldId: string) => void` - Callback for deleting fields
- `onFieldReorder?: (fieldIds: string[]) => void` - Optional callback for field reordering
- `remainingFieldsCount: number` - Number of fields remaining across all sections
- `maxFieldsPerSection?: number` - Maximum fields per section (default: 10)

**Features:**
- Add, edit, and delete fields
- Field validation with real-time feedback
- Privacy setting controls
- Character count indicators
- Drag and drop field reordering (optional)
- Empty state handling

## Types

### CustomField
```typescript
interface CustomField {
  label: string; // max 30 chars
  value: string; // max 200 chars
  privacy: 'public' | 'friends';
}
```

### CustomSection
```typescript
interface CustomSection {
  title: string; // max 50 chars
  fields: { [fieldId: string]: CustomField };
  order: number;
}
```

### CustomProfile
```typescript
interface CustomProfile {
  sections: { [sectionId: string]: CustomSection };
  customFieldsCount: number; // max 15 total fields
  maxSections: number; // max 5 sections
  lastCustomUpdate: string | null;
}
```

## Services

### ProfileService

Handles API calls for custom profile operations.

**Methods:**
- `getCustomProfile()` - Fetch user's custom profile
- `createSection(title: string)` - Create a new section
- `updateSection(sectionId: string, title: string)` - Update section title
- `deleteSection(sectionId: string)` - Delete a section
- `addField(sectionId: string, field: CustomField)` - Add field to section
- `updateField(sectionId: string, fieldId: string, field: CustomField)` - Update field
- `deleteField(sectionId: string, fieldId: string)` - Delete field
- `validateField(field: CustomField)` - Validate field data
- `validateSectionTitle(title: string)` - Validate section title

## Usage Example

```tsx
import CustomProfileManager from '@/components/profile/CustomProfileManager';
import { CustomProfile } from '@/types/profile';

function ProfilePage() {
  const handleProfileUpdate = (profile: CustomProfile) => {
    console.log('Profile updated:', profile);
  };

  return (
    <CustomProfileManager
      userId="user123"
      maxSections={5}
      maxTotalFields={15}
      onProfileUpdate={handleProfileUpdate}
    />
  );
}
```

## API Endpoints

The components interact with the following API endpoints:

- `GET /api/v1/users/profile/custom-sections` - Fetch custom profile
- `PUT /api/v1/users/profile/custom-sections` - Update custom profile

## Validation Rules

### Section Titles
- Required
- Maximum 50 characters
- Trimmed of whitespace

### Field Labels
- Required
- Maximum 30 characters
- Trimmed of whitespace

### Field Values
- Required
- Maximum 200 characters
- Trimmed of whitespace

### Privacy Settings
- Must be either 'public' or 'friends'

### Limits
- Maximum 5 sections per user
- Maximum 15 total fields across all sections
- Maximum 10 fields per section (configurable)

## Testing

Tests are located in `__tests__/` directory:
- `CustomProfileManager.test.tsx` - Tests for main component
- `DynamicFormBuilder.test.tsx` - Tests for form builder
- `../services/__tests__/profileService.test.ts` - Tests for service layer

Run tests with:
```bash
npm test -- --testPathPattern="profile"
```

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly
- Focus management
- Color contrast compliance

## Performance Considerations

- Optimistic updates for better UX
- Debounced validation
- Minimal re-renders
- Efficient drag and drop
- Lazy loading of components