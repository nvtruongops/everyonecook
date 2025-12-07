# Recipe Components

This directory contains all recipe-related UI components.

## Components

### RecipeCard
Display recipe information in a card format.
- Used in: AI suggestions page, search results
- Props: recipe data, onClick handler

### RecipeDetailModal
Modal dialog showing full recipe details.
- Used in: When user clicks on a recipe card
- Props: recipe data, onClose, onStartCooking

### ShareToFeedButton
Button to share recipe/cooking session to social feed.
- Used in: Recipe detail, cooking completion
- Props: sessionId, recipeId, recipeTitle

## Usage

```tsx
import { RecipeCard, RecipeDetailModal } from '@/components/recipes';

// Use in your component
<RecipeCard recipe={recipe} onClick={handleClick} />
```

## File Structure

```
recipes/
├── index.ts              # Centralized exports
├── RecipeCard.tsx        # Recipe card component
├── RecipeDetailModal.tsx # Recipe detail modal
├── ShareToFeedButton.tsx # Share to feed button
├── __tests__/            # Component tests
└── README.md             # This file
```
