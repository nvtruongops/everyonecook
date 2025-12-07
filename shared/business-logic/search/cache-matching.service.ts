/**
 * Cache Matching Service - Smart Cache Key Matching Logic
 *
 * Purpose: Implement complex cache matching rules for AI recipe suggestions
 *
 * CACHE KEY FORMAT:
 * - Cache key chỉ có 5 thành phần: ingredients|servings|mealType|maxTime|cookingMethods
 * - dislikedIngredients là trường THAM KHẢO riêng, KHÔNG nằm trong cache key
 * - Ví dụ: "chicken|garlic|onion|s2|lunch|t60|xao"
 *
 * Matching Rules:
 * 1. mealType:
 *    - User selects "none" (tùy chỉnh) → matches ANY cache mealType
 *    - User selects specific (breakfast/lunch/dinner/snack) → must match exactly, NOT "none"
 *
 * 2. servings:
 *    - Must match EXACTLY (2 người ≠ 1 người)
 *
 * 3. maxTime:
 *    - User requests 45min → matches cache with 60min (cache has MORE time)
 *    - User requests 60min → does NOT match cache with 45min (cache has LESS time)
 *
 * 4. dislikedIngredients (TRƯỜNG THAM KHẢO - không trong cache key):
 *    - User không nhập → chỉ match với cache KHÔNG có disliked
 *    - User có nhập → cache phải có TẤT CẢ disliked của user
 *    - Nếu disliked trùng với ingredients → đã bị loại, không cần check
 *
 * 5. preferredCookingMethods:
 *    - User không nhập → matches ANY cache methods
 *    - User có nhập → cache phải chứa TẤT CẢ methods của user
 *
 * 6. ingredients:
 *    - User ingredients must be SUBSET of cache ingredients
 *    - User: [chicken, onion] → matches cache: [chicken, onion, garlic, fish-sauce]
 */

export interface CacheMatchSettings {
  servings: number;
  mealType: 'none' | 'breakfast' | 'lunch' | 'dinner' | 'snack';
  maxTime: number;
  dislikedIngredients: string[];
  preferredCookingMethods: string[];
}

export interface CacheEntry {
  cacheKey: string;
  ingredients: string[];
  settings: CacheMatchSettings;
}

export interface MatchResult {
  isMatch: boolean;
  reason?: string;
  matchScore?: number; // 0-100, higher is better match
}

/**
 * Parse cache key to extract components
 *
 * Cache key format: "chicken|garlic|onion|s2|lunch|t60|xao"
 * NOTE: dislikedIngredients KHÔNG nằm trong cache key
 *
 * @param cacheKey - Cache key string
 * @param dislikedIngredients - Trường tham khảo riêng (từ cache metadata)
 * @returns Parsed cache entry
 */
export function parseCacheKey(cacheKey: string, dislikedIngredients: string[] = []): CacheEntry {
  const parts = cacheKey.split('|');

  // Find settings parts (start with s, t)
  const ingredientParts: string[] = [];
  let servings = 2;
  let mealType: CacheMatchSettings['mealType'] = 'none';
  let maxTime = 60;
  let cookingMethods: string[] = [];

  for (const part of parts) {
    if (part.startsWith('s') && /^s\d+$/.test(part)) {
      // Servings: s2, s4
      servings = parseInt(part.substring(1), 10);
    } else if (part.startsWith('t') && /^t\d+$/.test(part)) {
      // Max time: t30, t60
      maxTime = parseInt(part.substring(1), 10);
    } else if (['none', 'breakfast', 'lunch', 'dinner', 'snack'].includes(part)) {
      // Meal type
      mealType = part as CacheMatchSettings['mealType'];
    } else if (['xao', 'kho', 'luoc', 'nuong', 'hap', 'chien'].some((m) => part.includes(m))) {
      // Cooking methods: xao-kho, nuong
      cookingMethods = part.split('-').filter((m) => m !== 'none');
    } else if (part && !part.startsWith('s') && !part.startsWith('t')) {
      // Ingredient
      ingredientParts.push(part);
    }
  }

  return {
    cacheKey,
    ingredients: ingredientParts,
    settings: {
      servings,
      mealType,
      maxTime,
      dislikedIngredients, // Từ tham số, không từ cache key
      preferredCookingMethods: cookingMethods,
    },
  };
}

/**
 * Check if user request matches a cache entry
 *
 * @param userIngredients - User's input ingredients
 * @param userSettings - User's settings
 * @param cacheEntry - Cache entry to check
 * @returns Match result with reason
 */
export function checkCacheMatch(
  userIngredients: string[],
  userSettings: CacheMatchSettings,
  cacheEntry: CacheEntry
): MatchResult {
  const cacheSettings = cacheEntry.settings;
  let matchScore = 100;

  // 1. Check servings - MUST match exactly
  if (userSettings.servings !== cacheSettings.servings) {
    return {
      isMatch: false,
      reason: `Servings mismatch: user=${userSettings.servings}, cache=${cacheSettings.servings}`,
    };
  }

  // 2. Check mealType
  // - User "none" → matches ANY cache mealType
  // - User specific → must match exactly, NOT "none"
  if (userSettings.mealType !== 'none') {
    if (cacheSettings.mealType === 'none') {
      return {
        isMatch: false,
        reason: `MealType mismatch: user=${userSettings.mealType}, cache=none (generic cache cannot satisfy specific meal)`,
      };
    }
    if (userSettings.mealType !== cacheSettings.mealType) {
      return {
        isMatch: false,
        reason: `MealType mismatch: user=${userSettings.mealType}, cache=${cacheSettings.mealType}`,
      };
    }
  }
  // User "none" matches any cache mealType - no check needed

  // 3. Check maxTime
  // - User requests 45min → matches cache with 60min (cache has MORE time)
  // - User requests 60min → does NOT match cache with 45min (cache has LESS time)
  if (userSettings.maxTime > cacheSettings.maxTime) {
    return {
      isMatch: false,
      reason: `MaxTime mismatch: user=${userSettings.maxTime}min, cache=${cacheSettings.maxTime}min (cache recipe may be too slow)`,
    };
  }
  // Reduce score if cache has much more time than needed
  if (cacheSettings.maxTime > userSettings.maxTime) {
    matchScore -= Math.min(20, (cacheSettings.maxTime - userSettings.maxTime) / 3);
  }

  // 4. Check dislikedIngredients
  // - User has none → matches cache with none
  // - User has none → does NOT match cache with disliked items
  // - User has items → cache must have AT LEAST all user's disliked items
  const userDisliked = userSettings.dislikedIngredients || [];
  const cacheDisliked = cacheSettings.dislikedIngredients || [];

  if (userDisliked.length === 0) {
    // User has no disliked → cache must also have no disliked
    if (cacheDisliked.length > 0) {
      return {
        isMatch: false,
        reason: `DislikedIngredients mismatch: user has none, cache has [${cacheDisliked.join(', ')}]`,
      };
    }
  } else {
    // User has disliked items → cache must have ALL of user's disliked items
    const missingDisliked = userDisliked.filter((d) => !cacheDisliked.includes(d));
    if (missingDisliked.length > 0) {
      return {
        isMatch: false,
        reason: `DislikedIngredients mismatch: cache missing [${missingDisliked.join(', ')}]`,
      };
    }
  }

  // 5. Check preferredCookingMethods
  // - User has none → matches ANY cache methods
  // - User has specific methods → cache must contain ALL user methods
  const userMethods = (userSettings.preferredCookingMethods || []).filter((m) => m !== 'none');
  const cacheMethods = (cacheSettings.preferredCookingMethods || []).filter((m) => m !== 'none');

  if (userMethods.length > 0) {
    // User has specific methods → cache must have ALL of them
    const missingMethods = userMethods.filter((m) => !cacheMethods.includes(m));
    if (missingMethods.length > 0) {
      return {
        isMatch: false,
        reason: `CookingMethods mismatch: cache missing [${missingMethods.join(', ')}]`,
      };
    }
  }
  // User has no methods → matches any cache methods - no check needed

  // 6. Check ingredients
  // - User ingredients must be SUBSET of cache ingredients
  const userIngredientsNormalized = userIngredients.map((i) => i.toLowerCase());
  const cacheIngredientsNormalized = cacheEntry.ingredients.map((i) => i.toLowerCase());

  const missingIngredients = userIngredientsNormalized.filter(
    (i) => !cacheIngredientsNormalized.includes(i)
  );

  if (missingIngredients.length > 0) {
    return {
      isMatch: false,
      reason: `Ingredients mismatch: cache missing [${missingIngredients.join(', ')}]`,
    };
  }

  // Bonus score for exact ingredient match
  if (userIngredientsNormalized.length === cacheIngredientsNormalized.length) {
    matchScore += 10;
  }

  return {
    isMatch: true,
    matchScore: Math.min(100, matchScore),
  };
}

/**
 * Find best matching cache entry from a list
 *
 * @param userIngredients - User's input ingredients
 * @param userSettings - User's settings
 * @param cacheEntries - List of cache entries to check
 * @returns Best matching cache entry or null
 */
export function findBestCacheMatch(
  userIngredients: string[],
  userSettings: CacheMatchSettings,
  cacheEntries: CacheEntry[]
): { entry: CacheEntry; score: number } | null {
  let bestMatch: { entry: CacheEntry; score: number } | null = null;

  for (const entry of cacheEntries) {
    const result = checkCacheMatch(userIngredients, userSettings, entry);

    if (result.isMatch && result.matchScore !== undefined) {
      if (!bestMatch || result.matchScore > bestMatch.score) {
        bestMatch = { entry, score: result.matchScore };
      }
    }
  }

  return bestMatch;
}

/**
 * Generate cache key with settings
 *
 * IMPORTANT: Cache key chỉ có 5 thành phần chính:
 * - ingredients (sorted)
 * - servings
 * - mealType
 * - maxTime
 * - cookingMethods (optional)
 *
 * dislikedIngredients KHÔNG nằm trong cache key, chỉ là trường tham khảo riêng
 *
 * Format: "chicken|garlic|onion|s2|lunch|t60|xao"
 *
 * @param ingredients - Sorted normalized ingredients
 * @param settings - User settings
 * @returns Cache key string
 */
export function generateCacheKey(ingredients: string[], settings: CacheMatchSettings): string {
  const sortedIngredients = [...ingredients].sort().join('|');
  const servings = `s${settings.servings}`;
  const mealType = settings.mealType || 'none';
  const maxTime = `t${settings.maxTime}`;

  // Cooking methods (sorted, joined with -)
  // NOTE: dislikedIngredients KHÔNG nằm trong cache key
  const methods = (settings.preferredCookingMethods || [])
    .filter((m) => m !== 'none')
    .sort()
    .join('-');

  // Build cache key - CHỈ 5 thành phần, KHÔNG có dislikedIngredients
  const parts = [sortedIngredients, servings, mealType, maxTime];
  if (methods) parts.push(methods);

  return parts.join('|');
}

export class CacheMatchingService {
  /**
   * Check if user request can use a cached result
   */
  canUseCachedResult(
    userIngredients: string[],
    userSettings: CacheMatchSettings,
    cacheEntry: CacheEntry
  ): MatchResult {
    return checkCacheMatch(userIngredients, userSettings, cacheEntry);
  }

  /**
   * Find best matching cache from list
   */
  findBestMatch(
    userIngredients: string[],
    userSettings: CacheMatchSettings,
    cacheEntries: CacheEntry[]
  ): { entry: CacheEntry; score: number } | null {
    return findBestCacheMatch(userIngredients, userSettings, cacheEntries);
  }

  /**
   * Generate cache key
   */
  generateKey(ingredients: string[], settings: CacheMatchSettings): string {
    return generateCacheKey(ingredients, settings);
  }

  /**
   * Parse cache key
   */
  parseKey(cacheKey: string): CacheEntry {
    return parseCacheKey(cacheKey);
  }
}
