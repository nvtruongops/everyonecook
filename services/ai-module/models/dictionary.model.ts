/**
 * Dictionary Models
 *
 * Type definitions for Vietnamese-English ingredient dictionary.
 *
 * @see .kiro/specs/project-restructure/database-architecture.md - Dictionary Table section
 */

/**
 * Dictionary entry in DynamoDB
 */
export interface DictionaryEntry {
  /** Partition key: DICTIONARY */
  PK: string;

  /** Sort key: INGREDIENT#{normalized-vietnamese} */
  SK: string;

  /** Original Vietnamese name (with accents) */
  source: string;

  /** English translation */
  target: string;

  /** GSI5 partition key: English name (for duplicate prevention) */
  GSI5PK: string;

  /** GSI5 sort key: INGREDIENT#{normalized-vietnamese} */
  GSI5SK: string;

  /**
   * How the entry was added (MVP: only 2 sources)
   * - bootstrap: Initial 422 ingredients seeded at system startup
   * - AI: Auto-learned from AI translations (Dictionary auto-learning)
   */
  addedBy: 'bootstrap' | 'AI';

  /** Entry creation timestamp */
  addedAt: number;

  /** Usage count (how many times this ingredient was looked up) */
  usageCount?: number;

  /** Last used timestamp */
  lastUsedAt?: number;

  /** Ingredient category */
  category?: IngredientCategory;

  /** Alternative names */
  alternatives?: string[];

  /**
   * Nutrition data per 100g (from USDA FoodData Central)
   * Used for instant, free nutrition calculation (<50ms, $0 cost)
   *
   * @see .kiro/specs/project-restructure/ai-services-design.md - Nutrition Calculation
   */
  nutrition?: NutritionPer100g;
}

/**
 * Ingredient categories (13 fixed categories from architecture standards)
 * @see .kiro/steering/ai-services-standards.md
 */
export type IngredientCategory =
  | 'meat' // Thịt (pork, beef, chicken, duck, lamb)
  | 'eggs' // Trứng (chicken-egg, duck-egg, quail-egg)
  | 'seafood' // Hải sản (shrimp, fish, crab, squid)
  | 'vegetables' // Rau củ (tomato, carrot, cabbage, mushroom)
  | 'condiments' // Gia vị (fish-sauce, soy-sauce, salt, sugar)
  | 'oils' // Dầu ăn (vegetable-oil, sesame-oil, olive-oil)
  | 'grains' // Ngũ cốc (rice, noodles, bread, flour)
  | 'fruits' // Trái cây (banana, mango, apple, orange)
  | 'dairy' // Sữa (milk, cheese, yogurt, butter)
  | 'herbs' // Rau thơm (cilantro, basil, mint, lemongrass)
  | 'legumes' // Đậu (tofu, soybean, mung-bean)
  | 'nuts' // Hạt (peanut, cashew, almond)
  | 'aromatics'; // Gia vị thơm (garlic, ginger, shallot, onion)

/**
 * Dictionary lookup result
 */
export interface DictionaryLookupResult {
  /** Whether the ingredient was found */
  found: boolean;

  /** English translation (if found) */
  translation?: string;

  /** Original Vietnamese name */
  vietnamese: string;

  /** Normalized Vietnamese name */
  normalized: string;

  /** Ingredient category */
  category?: IngredientCategory;

  /** Alternative names */
  alternatives?: string[];
}

/**
 * Nutrition data per 100g
 * Source: USDA FoodData Central
 *
 * Used for instant nutrition calculation:
 * - Dictionary lookup: <50ms, $0 cost
 * - AI fallback: 2-3s, $0.01 cost (only for new ingredients)
 */
export interface NutritionPer100g {
  /** Calories per 100g */
  calories: number;

  /** Protein in grams per 100g */
  protein: number;

  /** Carbohydrates in grams per 100g */
  carbs: number;

  /** Fat in grams per 100g */
  fat: number;

  /** Fiber in grams per 100g */
  fiber?: number;

  /** Sodium in milligrams per 100g */
  sodium?: number;

  /** Sugar in grams per 100g */
  sugar?: number;

  /** Vitamins (optional, for detailed nutrition) */
  vitamins?: {
    vitaminA?: number; // IU
    vitaminC?: number; // mg
    vitaminD?: number; // IU
    vitaminE?: number; // mg
    vitaminK?: number; // mcg
    vitaminB6?: number; // mg
    vitaminB12?: number; // mcg
  };

  /** Minerals (optional, for detailed nutrition) */
  minerals?: {
    calcium?: number; // mg
    iron?: number; // mg
    magnesium?: number; // mg
    phosphorus?: number; // mg
    potassium?: number; // mg
    zinc?: number; // mg
  };

  /** Data source information */
  dataSource?: {
    /** Source name (e.g., "USDA FoodData Central") */
    name: string;

    /** FoodData Central ID */
    fdcId?: string;

    /** Confidence score (0-1) */
    confidence?: number;

    /** Last updated timestamp */
    lastUpdated?: number;
  };
}

/**
 * Translation cache entry in DynamoDB
 */
export interface TranslationCacheEntry {
  /** Partition key: TRANSLATION_CACHE */
  PK: string;

  /** Sort key: INGREDIENT#{normalized-vietnamese} */
  SK: string;

  /** Original Vietnamese name */
  source: string;

  /** English translation */
  target: string;

  /** GSI5 partition key: English name (for duplicate prevention) */
  GSI5PK: string;

  /** GSI5 sort key: INGREDIENT#{normalized-vietnamese} */
  GSI5SK: string;

  /**
   * How the translation was obtained (MVP: only AI)
   * Translation Cache is temporary storage for AI translations
   * before they are promoted to Dictionary
   */
  translatedBy: 'AI';

  /** Translation creation timestamp */
  createdAt: number;

  /** Usage count */
  usageCount: number;

  /** Last used timestamp */
  lastUsedAt: number;

  /** TTL timestamp (1 year = 31,536,000 seconds) */
  ttl: number;

  /** Whether this should be promoted to Dictionary */
  shouldPromote?: boolean;

  /**
   * Nutrition data per 100g (optional)
   * May be added when promoting to Dictionary
   */
  nutrition?: NutritionPer100g;
}
