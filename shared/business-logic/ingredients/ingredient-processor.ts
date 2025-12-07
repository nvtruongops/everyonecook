/**
 * Ingredient Processor - Chuẩn hóa xử lý nguyên liệu
 *
 * Flow chuẩn:
 * 1. User nhập tiếng Việt: "Thịt Ba Chỉ"
 * 2. Normalize: "thit-ba-chi"
 * 3. Lookup Dictionary → lấy English + Nutrition
 * 4. Lưu đầy đủ thông tin
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Input format - User chỉ cần nhập tiếng Việt và số lượng
 */
export interface IngredientInput {
  vietnamese: string; // "Thịt Ba Chỉ" - Bắt buộc
  amount?: string; // "200g" - Tùy chọn
  notes?: string; // "Thái mỏng" - Tùy chọn
}

/**
 * Output format - Đầy đủ thông tin sau khi xử lý
 */
export interface ProcessedIngredient {
  vietnamese: string; // "Thịt Ba Chỉ" - Giữ nguyên input
  normalized: string; // "thit-ba-chi" - Auto generate
  english: string; // "pork-belly" - Từ Dictionary hoặc AI
  category: string; // "meat" - Từ Dictionary
  amount?: string; // "200g"
  notes?: string; // "Thái mỏng"
  nutrition?: NutritionPer100g; // Từ Dictionary
  source: 'dictionary' | 'ai' | 'unknown'; // Nguồn dữ liệu
}

/**
 * Nutrition per 100g
 */
export interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

/**
 * Dictionary entry structure
 */
interface DictionaryEntry {
  PK: string;
  SK: string;
  source: string;
  target: {
    specific: string;
    general: string;
    category: string;
  };
  nutrition?: {
    per100g: NutritionPer100g;
    dataSource: string;
  };
}

/**
 * Normalize Vietnamese text
 * "Thịt Ba Chỉ" → "thit-ba-chi"
 */
export function normalizeVietnamese(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd') // Handle đ
    .replace(/Đ/g, 'd')
    .replace(/\s+/g, '-') // Spaces → hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove special chars
    .replace(/-+/g, '-') // Multiple hyphens → single
    .replace(/^-|-$/g, ''); // Trim hyphens
}

/**
 * Lookup single ingredient from Dictionary
 */
async function lookupDictionary(
  normalized: string,
  tableName: string
): Promise<DictionaryEntry | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: 'DICTIONARY',
          SK: `INGREDIENT#${normalized}`,
        },
      })
    );
    return result.Item as DictionaryEntry | null;
  } catch (error) {
    console.warn(`Dictionary lookup failed for ${normalized}:`, error);
    return null;
  }
}

/**
 * Batch lookup ingredients from Dictionary
 */
async function batchLookupDictionary(
  normalizedList: string[],
  tableName: string
): Promise<Map<string, DictionaryEntry>> {
  const results = new Map<string, DictionaryEntry>();

  if (normalizedList.length === 0) return results;

  // DynamoDB BatchGet limit is 100 items
  const batches: string[][] = [];
  for (let i = 0; i < normalizedList.length; i += 100) {
    batches.push(normalizedList.slice(i, i + 100));
  }

  for (const batch of batches) {
    try {
      const keys = batch.map((normalized) => ({
        PK: 'DICTIONARY',
        SK: `INGREDIENT#${normalized}`,
      }));

      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: keys },
          },
        })
      );

      const items = result.Responses?.[tableName] || [];
      for (const item of items) {
        const entry = item as DictionaryEntry;
        const normalized = entry.SK.replace('INGREDIENT#', '');
        results.set(normalized, entry);
      }
    } catch (error) {
      console.warn('Batch dictionary lookup failed:', error);
    }
  }

  return results;
}

/**
 * Process single ingredient
 * Input: { vietnamese: "Thịt Ba Chỉ", amount: "200g" }
 * Output: { vietnamese, normalized, english, category, amount, nutrition, source }
 */
export async function processIngredient(
  input: IngredientInput,
  tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook'
): Promise<ProcessedIngredient> {
  const normalized = normalizeVietnamese(input.vietnamese);

  // Lookup from Dictionary
  const dictEntry = await lookupDictionary(normalized, tableName);

  if (dictEntry) {
    return {
      vietnamese: input.vietnamese,
      normalized,
      english: dictEntry.target.specific,
      category: dictEntry.target.category || 'other',
      amount: input.amount,
      notes: input.notes,
      nutrition: dictEntry.nutrition?.per100g,
      source: 'dictionary',
    };
  }

  // Not found in Dictionary - return with unknown source
  // AI translation can be added later
  return {
    vietnamese: input.vietnamese,
    normalized,
    english: normalized, // Fallback to normalized as English
    category: 'unknown',
    amount: input.amount,
    notes: input.notes,
    source: 'unknown',
  };
}

/**
 * Process multiple ingredients (batch)
 * More efficient than processing one by one
 */
export async function processIngredients(
  inputs: IngredientInput[],
  tableName: string = process.env.DYNAMODB_TABLE || 'EveryoneCook'
): Promise<ProcessedIngredient[]> {
  if (inputs.length === 0) return [];

  // Step 1: Normalize all
  const normalizedMap = new Map<string, IngredientInput>();
  for (const input of inputs) {
    const normalized = normalizeVietnamese(input.vietnamese);
    normalizedMap.set(normalized, input);
  }

  // Step 2: Batch lookup from Dictionary
  const dictEntries = await batchLookupDictionary(Array.from(normalizedMap.keys()), tableName);

  // Step 3: Build results
  const results: ProcessedIngredient[] = [];

  for (const [normalized, input] of normalizedMap) {
    const dictEntry = dictEntries.get(normalized);

    if (dictEntry) {
      results.push({
        vietnamese: input.vietnamese,
        normalized,
        english: dictEntry.target.specific,
        category: dictEntry.target.category || 'other',
        amount: input.amount,
        notes: input.notes,
        nutrition: dictEntry.nutrition?.per100g,
        source: 'dictionary',
      });
    } else {
      results.push({
        vietnamese: input.vietnamese,
        normalized,
        english: normalized,
        category: 'unknown',
        amount: input.amount,
        notes: input.notes,
        source: 'unknown',
      });
    }
  }

  return results;
}

/**
 * Calculate total nutrition from processed ingredients
 */
export function calculateTotalNutrition(
  ingredients: ProcessedIngredient[]
): NutritionPer100g | null {
  const withNutrition = ingredients.filter((ing) => ing.nutrition);

  if (withNutrition.length === 0) return null;

  const total: NutritionPer100g = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  };

  for (const ing of withNutrition) {
    if (ing.nutrition) {
      // Parse amount to get multiplier (e.g., "200g" → 2)
      const multiplier = parseAmountMultiplier(ing.amount);

      total.calories += (ing.nutrition.calories || 0) * multiplier;
      total.protein += (ing.nutrition.protein || 0) * multiplier;
      total.carbs += (ing.nutrition.carbs || 0) * multiplier;
      total.fat += (ing.nutrition.fat || 0) * multiplier;
      total.fiber! += (ing.nutrition.fiber || 0) * multiplier;
    }
  }

  // Round to 1 decimal
  return {
    calories: Math.round(total.calories),
    protein: Math.round(total.protein * 10) / 10,
    carbs: Math.round(total.carbs * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    fiber: Math.round(total.fiber! * 10) / 10,
  };
}

/**
 * Parse amount string to get multiplier for 100g base
 * "200g" → 2, "50g" → 0.5, "1kg" → 10
 */
function parseAmountMultiplier(amount?: string): number {
  if (!amount) return 1;

  const match = amount.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)?/);
  if (!match) return 1;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'g';

  switch (unit) {
    case 'kg':
    case 'l':
      return value * 10; // 1kg = 1000g = 10 * 100g
    case 'g':
    case 'ml':
    default:
      return value / 100; // Convert to 100g base
  }
}

/**
 * Convert any ingredient format to standard ProcessedIngredient
 * Handles legacy formats from existing data
 */
export function normalizeIngredientFormat(ingredient: any): ProcessedIngredient {
  // Already processed format
  if (ingredient.normalized && ingredient.english) {
    return ingredient as ProcessedIngredient;
  }

  // String format: "Thịt bò"
  if (typeof ingredient === 'string') {
    const normalized = normalizeVietnamese(ingredient);
    return {
      vietnamese: ingredient,
      normalized,
      english: normalized,
      category: 'unknown',
      source: 'unknown',
    };
  }

  // Object with vietnamese
  if (ingredient.vietnamese) {
    const normalized = normalizeVietnamese(ingredient.vietnamese);
    return {
      vietnamese: ingredient.vietnamese,
      normalized: ingredient.normalized || normalized,
      english: ingredient.english || normalized,
      category: ingredient.category || 'unknown',
      amount: ingredient.amount,
      notes: ingredient.notes,
      nutrition: ingredient.nutrition,
      source: ingredient.source || 'unknown',
    };
  }

  // Object with name (legacy)
  if (ingredient.name) {
    const normalized = normalizeVietnamese(ingredient.name);
    return {
      vietnamese: ingredient.name,
      normalized,
      english: normalized,
      category: 'unknown',
      amount: ingredient.amount,
      source: 'unknown',
    };
  }

  // Fallback
  const str = String(ingredient);
  const normalized = normalizeVietnamese(str);
  return {
    vietnamese: str,
    normalized,
    english: normalized,
    category: 'unknown',
    source: 'unknown',
  };
}
