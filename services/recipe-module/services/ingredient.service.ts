/**
 * Ingredient Service - Xử lý và chuẩn hóa nguyên liệu
 *
 * Flow chuẩn:
 * 1. User nhập tiếng Việt: "Thịt Ba Chỉ"
 * 2. Normalize: "thit-ba-chi"
 * 3. Lookup: Dictionary → Translation Cache (1 năm) → AI
 * 4. Trả về ProcessedIngredient đầy đủ
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ProcessedIngredient, RecipeNutrition } from '../models/recipe.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true, // Remove undefined values from objects
  },
});
const TABLE_NAME = process.env.DYNAMODB_TABLE || process.env.DYNAMODB_TABLE_NAME || 'EveryoneCook';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'ap-southeast-1',
});

/**
 * Input format - User chỉ cần nhập tiếng Việt và số lượng
 */
export interface IngredientInput {
  vietnamese: string; // "Thịt Ba Chỉ" - Bắt buộc
  amount?: string; // "200g" - Tùy chọn
  notes?: string; // "Thái mỏng" - Tùy chọn
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
    per100g: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber?: number;
    };
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
 * Batch lookup ingredients from Dictionary
 */
async function batchLookupDictionary(
  normalizedList: string[]
): Promise<Map<string, DictionaryEntry>> {
  const results = new Map<string, DictionaryEntry>();

  if (normalizedList.length === 0) return results;

  // Deduplicate
  const uniqueList = [...new Set(normalizedList)];

  // DynamoDB BatchGet limit is 100 items
  const batches: string[][] = [];
  for (let i = 0; i < uniqueList.length; i += 100) {
    batches.push(uniqueList.slice(i, i + 100));
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
            [TABLE_NAME]: { Keys: keys },
          },
        })
      );

      const items = result.Responses?.[TABLE_NAME] || [];
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
 * Lookup single ingredient from Translation Cache (1 năm TTL)
 */
async function lookupTranslationCache(normalized: string): Promise<DictionaryEntry | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        },
      })
    );

    if (result.Item) {
      const now = Math.floor(Date.now() / 1000);
      // Check TTL
      if (!result.Item.ttl || result.Item.ttl > now) {
        return result.Item as DictionaryEntry;
      }
    }
    return null;
  } catch (error) {
    console.warn('Translation Cache lookup failed:', error);
    return null;
  }
}

/**
 * Translate ingredient using AI and get nutrition
 */
async function translateWithAI(
  vietnamese: string,
  normalized: string
): Promise<{ english: string; category: string; nutrition: DictionaryEntry['nutrition'] }> {
  const prompt = `You are a nutrition expert. Translate this Vietnamese ingredient to English and provide nutrition data.

Vietnamese ingredient: ${vietnamese}

Return ONLY a JSON object with this exact format (no explanation):
{"english": "ingredient-name-in-english", "category": "meat|seafood|vegetables|fruits|grains|dairy|condiments|herbs|other", "nutrition": {"calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>}}

Use USDA database values as reference. All nutrition values are per 100g.`;

  try {
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 200,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const aiText = responseBody.content[0].text.trim();

    // Parse JSON from AI response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const englishNormalized = parsed.english.toLowerCase().replace(/\s+/g, '-');

    // Save to Translation Cache (1 năm TTL)
    // Format matches bootstrap-dictionary.py for consistency
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const timestamp = Date.now();
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`, // Vietnamese normalized for lookup
          source: vietnamese, // Original with accents
          sourceNormalized: normalized,
          englishNormalized: englishNormalized, // Keep English for reference
          target: {
            specific: englishNormalized,
            general: englishNormalized,
            category: parsed.category || 'other',
          },
          nutrition: {
            per100g: {
              calories: parsed.nutrition?.calories || 0,
              protein: parsed.nutrition?.protein || 0,
              carbs: parsed.nutrition?.carbs || 0,
              fat: parsed.nutrition?.fat || 0,
              fiber: parsed.nutrition?.fiber || 0,
            },
            dataSource: 'AI',
          },
          addedBy: 'AI',
          addedAt: timestamp,
          usageCount: 1,
          lastUsed: timestamp,
          ttl,
          // GSI5 for English lookup (ai-worker uses this)
          GSI5PK: englishNormalized, // English normalized (lowercase-hyphen)
          GSI5SK: 'TRANSLATION_CACHE', // Fixed value for GSI5 lookup
        },
      })
    );

    return {
      english: englishNormalized,
      category: parsed.category || 'other',
      nutrition: {
        per100g: parsed.nutrition,
        dataSource: 'AI',
      },
    };
  } catch (error) {
    console.error('AI translation failed:', error);
    // Return fallback
    return {
      english: normalized,
      category: 'unknown',
      nutrition: undefined,
    };
  }
}

/**
 * Process ingredients - Chuẩn hóa và lookup Dictionary/Cache/AI
 *
 * Flow:
 * 1. Normalize Vietnamese → "thit-ba-chi"
 * 2. Batch lookup Dictionary
 * 3. Nếu không có → Lookup Translation Cache (1 năm TTL)
 * 4. Nếu không có → Gọi AI và lưu vào Translation Cache
 *
 * @param inputs - Array of ingredient inputs (có thể là string hoặc object)
 * @returns Array of ProcessedIngredient
 */
export async function processIngredients(
  inputs: (string | IngredientInput | unknown)[]
): Promise<ProcessedIngredient[]> {
  if (!inputs || inputs.length === 0) return [];

  // Step 1: Normalize all inputs to IngredientInput format
  const normalizedInputs: { input: IngredientInput; normalized: string }[] = [];

  for (const input of inputs) {
    let ingredientInput: IngredientInput;

    if (typeof input === 'string') {
      // String format: "Thịt bò"
      ingredientInput = { vietnamese: input };
    } else if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (obj.vietnamese) {
        // Object with vietnamese field
        ingredientInput = {
          vietnamese: obj.vietnamese as string,
          amount: obj.amount as string | undefined,
          notes: obj.notes as string | undefined,
        };
      } else if (obj.vietnameseName) {
        // AI recipe format: { name: "english", vietnameseName: "Tiếng Việt", quantity, unit }
        ingredientInput = {
          vietnamese: obj.vietnameseName as string,
          amount: obj.quantity
            ? `${obj.quantity}${obj.unit ? ` ${obj.unit}` : ''}`
            : (obj.amount as string | undefined),
          notes: obj.notes as string | undefined,
        };
      } else if (obj.name) {
        // AI format: name is English (lowercase-hyphen), vietnameseName is Vietnamese
        // If vietnameseName exists, use it; otherwise name might be Vietnamese (legacy)
        const nameStr = (obj.name as string).replace(/-/g, ' ');
        ingredientInput = {
          // Prefer vietnameseName if available, fallback to name (might be Vietnamese in legacy format)
          vietnamese: (obj.vietnameseName as string) || nameStr,
          amount: obj.quantity
            ? `${obj.quantity}${obj.unit ? ` ${obj.unit}` : ''}`
            : (obj.amount as string | undefined),
        };
      } else {
        // Fallback
        ingredientInput = { vietnamese: String(input) };
      }
    } else {
      // Fallback
      ingredientInput = { vietnamese: String(input) };
    }

    const normalized = normalizeVietnamese(ingredientInput.vietnamese);
    normalizedInputs.push({ input: ingredientInput, normalized });
  }

  // Step 2: Batch lookup from Dictionary
  const normalizedList = normalizedInputs.map((n) => n.normalized);
  const dictEntries = await batchLookupDictionary(normalizedList);

  // Step 3: Build results with 3-tier lookup
  const results: ProcessedIngredient[] = [];

  for (const { input, normalized } of normalizedInputs) {
    // Tier 1: Dictionary
    const dictEntry = dictEntries.get(normalized);
    if (dictEntry) {
      results.push({
        vietnamese: input.vietnamese,
        normalized,
        english: dictEntry.target?.specific || normalized,
        category: dictEntry.target?.category || 'other',
        amount: input.amount,
        notes: input.notes,
        nutrition: dictEntry.nutrition?.per100g,
        source: 'dictionary',
      });
      continue;
    }

    // Tier 2: Translation Cache (1 năm TTL)
    const cacheEntry = await lookupTranslationCache(normalized);
    if (cacheEntry) {
      results.push({
        vietnamese: input.vietnamese,
        normalized,
        english: cacheEntry.target?.specific || normalized,
        category: cacheEntry.target?.category || 'other',
        amount: input.amount,
        notes: input.notes,
        nutrition: cacheEntry.nutrition?.per100g,
        source: 'cache',
      });
      continue;
    }

    // Tier 3: AI Translation + Nutrition (và lưu vào Translation Cache 1 năm)
    const aiResult = await translateWithAI(input.vietnamese, normalized);
    results.push({
      vietnamese: input.vietnamese,
      normalized,
      english: aiResult.english,
      category: aiResult.category,
      amount: input.amount,
      notes: input.notes,
      nutrition: aiResult.nutrition?.per100g,
      source: 'ai',
    });
  }

  return results;
}

/**
 * Calculate total nutrition from processed ingredients
 */
export function calculateTotalNutrition(
  ingredients: ProcessedIngredient[],
  servings: number = 1
): RecipeNutrition | undefined {
  const withNutrition = ingredients.filter((ing) => ing.nutrition);

  if (withNutrition.length === 0) return undefined;

  const total = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  };

  for (const ing of withNutrition) {
    if (ing.nutrition) {
      const multiplier = parseAmountMultiplier(ing.amount);

      total.calories += (ing.nutrition.calories || 0) * multiplier;
      total.protein += (ing.nutrition.protein || 0) * multiplier;
      total.carbs += (ing.nutrition.carbs || 0) * multiplier;
      total.fat += (ing.nutrition.fat || 0) * multiplier;
      total.fiber += (ing.nutrition.fiber || 0) * multiplier;
    }
  }

  // Return per serving
  return {
    calories: Math.round(total.calories / servings),
    protein: Math.round((total.protein * 10) / servings) / 10,
    carbs: Math.round((total.carbs * 10) / servings) / 10,
    fat: Math.round((total.fat * 10) / servings) / 10,
    fiber: Math.round((total.fiber * 10) / servings) / 10,
    servings,
  };
}

/**
 * Unit to grams conversion map
 * Used for nutrition calculation (per 100g base)
 */
const UNIT_TO_GRAMS: Record<string, number> = {
  // === Weight units ===
  g: 1,
  gram: 1,
  gam: 1,
  kg: 1000,
  kilogram: 1000,
  ký: 1000,
  lạng: 100, // 1 lạng = 100g
  cân: 600, // 1 cân ta = 600g

  // === Volume units ===
  ml: 1,
  milliliter: 1,
  l: 1000,
  liter: 1000,
  lít: 1000,

  // === Spoon measurements ===
  tablespoon: 15,
  tbsp: 15,
  'thìa canh': 15,
  'muỗng canh': 15,
  muỗng: 15,
  'muỗng súp': 15,
  teaspoon: 5,
  tsp: 5,
  'thìa cà phê': 5,
  'muỗng cà phê': 5,
  'muỗng cà': 5,
  mc: 15, // muỗng canh viết tắt

  // === Cup measurements ===
  cup: 240,
  cốc: 240,
  chén: 200,
  ly: 200,
  bát: 300,
  tô: 400,

  // === Meat/Fish pieces ===
  miếng: 80,
  khoanh: 60, // 1 khoanh cá/thịt ~60g
  lát: 30, // 1 lát mỏng ~30g
  thỏi: 100,
  thanh: 50,
  xiên: 80, // 1 xiên thịt ~80g
  con: 150, // 1 con cá nhỏ ~150g
  'con nhỏ': 100,
  'con vừa': 200,
  'con lớn': 400,

  // === Seafood ===
  'con tôm': 15,
  'con mực': 200,
  'con cua': 300,
  'con nghêu': 10,
  'con sò': 15,
  'con ốc': 8,

  // === Vegetables ===
  củ: 100,
  'củ nhỏ': 50,
  'củ vừa': 100,
  'củ lớn': 200,
  cây: 20,
  nhánh: 10,
  lá: 2,
  bó: 50,
  'bó nhỏ': 30,
  'bó lớn': 100,
  nắm: 30, // 1 nắm rau ~30g
  mớ: 100, // 1 mớ rau ~100g

  // === Fruits ===
  trái: 50,
  quả: 50,
  'quả nhỏ': 30,
  'quả vừa': 80,
  'quả lớn': 150,
  múi: 30, // 1 múi cam/bưởi ~30g
  'lát trái cây': 20,

  // === Eggs ===
  'quả trứng': 50,
  trứng: 50,
  'trứng gà': 50,
  'trứng vịt': 70,
  'trứng cút': 10,
  'lòng đỏ': 18,
  'lòng trắng': 33,

  // === Garlic/Onion/Ginger ===
  tép: 5, // 1 tép tỏi ~5g
  'tép tỏi': 5,
  'nhánh hành': 10,
  'củ hành': 80,
  'củ tỏi': 30,
  'củ gừng': 50,
  'lát gừng': 3,

  // === Tofu/Bean products ===
  'miếng đậu': 100,
  'miếng đậu hũ': 100,
  'bìa đậu': 200,

  // === Noodles/Rice ===
  phần: 200, // 1 phần mì/bún ~200g
  vắt: 100, // 1 vắt mì ~100g
  gói: 80, // 1 gói mì ăn liền ~80g
  'bát cơm': 150,
  'chén cơm': 150,

  // === General pieces ===
  piece: 100,
  cái: 100,
  viên: 15, // 1 viên thịt/cá ~15g
  hạt: 1, // 1 hạt tiêu/đậu ~1g
  nhúm: 2, // 1 nhúm gia vị ~2g
  chút: 1,
  ít: 5,
  'vừa đủ': 10,
};

/**
 * Parse amount string to get multiplier for 100g base
 * Supports Vietnamese units: muỗng cà, cây, trái, etc.
 */
function parseAmountMultiplier(amount?: string): number {
  if (!amount) return 1;

  const normalized = amount.toLowerCase().trim();

  // Try to match number + unit pattern
  // Supports: "200g", "1 muỗng cà", "2 cây", "1 trái"
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return 1;

  const value = parseFloat(match[1]);
  const unit = match[2].trim() || 'g';

  // Get grams per unit
  const gramsPerUnit = UNIT_TO_GRAMS[unit] || 100; // Default 100g if unknown unit

  // Return multiplier for 100g base
  return (value * gramsPerUnit) / 100;
}

/**
 * Convert any ingredient format to ProcessedIngredient
 * For reading existing data from DynamoDB
 */
export function normalizeIngredientFormat(ingredient: unknown): ProcessedIngredient {
  if (!ingredient) {
    return {
      vietnamese: '',
      normalized: '',
      english: '',
      source: 'unknown',
    };
  }

  // Type guard for object
  const ing = ingredient as Record<string, unknown>;

  // Already processed format
  if (ing.normalized && ing.english) {
    return ingredient as ProcessedIngredient;
  }

  // String format
  if (typeof ingredient === 'string') {
    const normalized = normalizeVietnamese(ingredient);
    return {
      vietnamese: ingredient,
      normalized,
      english: normalized,
      source: 'unknown',
    };
  }

  // Object with vietnamese
  const vietnamese = (ing.vietnamese || ing.name || String(ingredient)) as string;
  const normalized = normalizeVietnamese(vietnamese);

  return {
    vietnamese,
    normalized: (ing.normalized as string) || normalized,
    english: (ing.english as string) || normalized,
    category: ing.category as string | undefined,
    amount: ing.amount as string | undefined,
    notes: ing.notes as string | undefined,
    nutrition: ing.nutrition as ProcessedIngredient['nutrition'],
    source: (ing.source as ProcessedIngredient['source']) || 'unknown',
  };
}
