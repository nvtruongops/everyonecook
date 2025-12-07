# Auth Module Services

## Overview

This directory contains business logic services for the Auth Module.

## Services

### 1. Profile Service (`profile.service.ts`)

Handles user profile CRUD operations with DynamoDB.

**Key Functions:**

- `getUserProfile(userId)` - Get user profile by ID
- `getPrivacySettings(userId)` - Get privacy settings
- `updateUserProfile(userId, updates)` - Update editable profile fields
- `updateAvatarUrl(userId, url)` - Update avatar URL
- `updateBackgroundUrl(userId, url)` - Update background URL
- `determineRelationship(userId, viewerId)` - Determine relationship (self/friend/stranger)

### 2. Privacy Filter Service (`privacy-filter.service.ts`)

Filters user profile based on privacy settings and relationship.

**Privacy Logic:**

#### Field-Level Privacy

Each profile field has a privacy level:

- **PUBLIC**: Visible to everyone (including anonymous users)
- **FRIENDS**: Visible to friends only
- **PRIVATE**: Visible to self only

#### Default Privacy Settings (Based on Requirements)

```typescript
{
  fullName: PUBLIC,        // Required for user search/discovery (cannot be PRIVATE)
  email: PRIVATE,          // Recommended default (user can change to PUBLIC or FRIENDS)
  birthday: PRIVATE,       // Private by default (user can change to PUBLIC or FRIENDS)
  gender: PRIVATE,         // Private by default (user can change to PUBLIC or FRIENDS)
  country: PUBLIC,         // Helps with discovery
  bio: PUBLIC,             // Profile description
  avatarUrl: PUBLIC,       // Profile picture visible to all
  backgroundUrl: PUBLIC,   // Cover photo visible to all
  savedRecipes: PRIVATE    // Private by default (user can change to PUBLIC or FRIENDS)
}
```

**Note:** All privacy settings can be changed by the user except:

- `fullName` cannot be set to PRIVATE (required for user search/discovery)

#### Avatar/Background Privacy with S3 OAC

**Important Distinction: Visibility vs Access**

Privacy levels control **VISIBILITY** (whether URL is shown), not **ACCESS** (whether image can be viewed).

**S3 Bucket Security:**

- ALL files in S3 are PRIVATE (Block All Public Access enabled)
- CloudFront is the ONLY way to access files
- CloudFront uses Origin Access Control (OAC) to access S3
- Users need CloudFront signed URLs to view images

**Privacy Level Behavior:**

1. **PUBLIC** (Default for avatar/background):
   - URL is visible in profile response
   - Example: `"avatarUrl": "https://cdn.everyonecook.cloud/avatars/user-123/avatar.jpg"`
   - User sees the URL but still needs signed URL to view the image
   - Like Facebook: Profile picture is "visible" but you can't hotlink it

2. **FRIENDS**:
   - URL is visible to friends only
   - Strangers see default avatar/background
   - Friends still need signed URL to view the actual image

3. **PRIVATE**:
   - URL is hidden from everyone except self
   - Others see default avatar/background
   - Example: `"avatarUrl": "https://cdn.everyonecook.cloud/defaults/avatar.png"`

**Why This Design?**

This matches social media best practices:

- ✅ Profile pictures are "public" (everyone sees them)
- ✅ But platform controls access (can't hotlink or download directly)
- ✅ Privacy setting controls whether URL is shown, not whether image can be accessed
- ✅ S3 OAC ensures all access goes through CloudFront with proper authentication

**Example Flow:**

```
User A views User B's profile:

1. Privacy Check:
   - B's avatarUrl privacy = PUBLIC
   - A is a stranger
   - Result: Show B's avatar URL

2. Image Access:
   - Frontend receives: "avatarUrl": "https://cdn.everyonecook.cloud/avatars/B/avatar.jpg"
   - Frontend requests signed URL from backend
   - Backend generates CloudFront signed URL (expires in 1 hour)
   - Frontend displays image using signed URL
   - S3 OAC ensures direct S3 access is blocked
```

#### SavedRecipes Privacy

**Default: PRIVATE** (Like Facebook Bookmarks)

- Only the owner can see their saved recipes
- This is NOT a social feature (unlike posts or comments)
- Similar to:
  - Facebook: Saved posts (private)
  - Instagram: Saved posts (private)
  - Twitter: Bookmarks (private)

**Why PRIVATE?**

Users save recipes for personal use:

- Meal planning
- Shopping lists
- Cooking later
- Not meant to be shared publicly

If users want to share recipes, they should:

- Create a post about it (social feature)
- Add to a public collection (future feature)

#### Relationship Types

```typescript
enum RelationshipType {
  SELF = 'self', // Viewing own profile
  FRIEND = 'friend', // Viewing friend's profile
  STRANGER = 'stranger', // Viewing stranger's profile (or anonymous)
}
```

#### Filtering Logic

```typescript
// Example: Stranger viewing profile (with default privacy settings)
{
  userId: "user-123",
  username: "john_doe",
  fullName: "John Doe",        // PUBLIC - visible
  country: "US",               // PUBLIC - visible
  bio: "Food lover",           // PUBLIC - visible
  avatarUrl: "https://...",    // PUBLIC - visible (signed URL required to view)
  backgroundUrl: "https://...", // PUBLIC - visible (signed URL required to view)
  // email: PRIVATE - hidden
  // birthday: PRIVATE - hidden
  // gender: PRIVATE - hidden
  // savedRecipes: PRIVATE - hidden
}
```

```typescript
// Example: Friend viewing profile (if user changed birthday/gender to FRIENDS level)
{
  userId: "user-123",
  username: "john_doe",
  fullName: "John Doe",        // PUBLIC - visible
  email: undefined,            // PRIVATE - hidden
  birthday: "1990-01-01",      // FRIENDS - visible to friends (if user changed from PRIVATE)
  gender: "male",              // FRIENDS - visible to friends (if user changed from PRIVATE)
  country: "US",               // PUBLIC - visible
  bio: "Food lover",           // PUBLIC - visible
  avatarUrl: "https://...",    // PUBLIC - visible
  backgroundUrl: "https://...", // PUBLIC - visible
  // savedRecipes: PRIVATE - still hidden (even from friends, unless user changed to FRIENDS)
}
```

## Testing

Run tests:

```bash
npm test -- services/
```

## References

- [User Profile Design](../../../.kiro/specs/project-restructure/user-profile-design.md)
- [User Profile Privacy](../../../.kiro/specs/project-restructure/user-profile-privacy.md)
- [Database Architecture](../../../.kiro/specs/project-restructure/database-architecture.md)
