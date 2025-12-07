/**
 * AI Worker - Process AI Recipe Generation Requests
 *
 * Purpose: Process SQS messages from AIQueue, generate recipes via Bedrock,
 *          and store results in AI Cache with GSI2/GSI4 indexes
 *
 * Trigger: SQS AIQueue
 * Performance: 25-35s (AI generation time)
 * Priority: HIGH - Core AI feature
 */

import { SQSEvent, SQSRecord } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AICacheService } from '../shared/business-logic/search/ai-cache.service';

interface AIJobMessage {
  jobId: string;
  userId: string;
  ingredients: string[]; // Normalized English ingredients
  settings: {
    servings: 1 | 2 | 3 | 4 | 5; // SIMPLIFIED: 1-5 only
    mealType: 'none' | 'breakfast' | 'lunch' | 'dinner' | 'snack'; // 'none' = any
    maxTime: 15 | 30 | 45 | 60 | 90 | 120;
    // Optional filters (NOT in cache key)
    dislikedIngredients?: string[];
    skillLevel?: 'none' | 'beginner' | 'intermediate' | 'expert';
    preferredCookingMethods?: ('none' | 'kho' | 'xào' | 'luộc' | 'nướng' | 'hấp' | 'chiên')[];
  };
  cacheKey: string;
}

interface AIRecipe {
  // name: Tiếng Việt only (string) hoặc legacy format {vietnamese, english}
  name: string | { vietnamese: string; english?: string };
  description: string; // Tiếng Việt
  usedIngredients?: string[]; // English ingredients used in this recipe (for cache key)
  ingredients: Array<{
    name: string; // English lowercase-hyphen (for cache key lookup)
    vietnameseName?: string; // Tiếng Việt (hiển thị cho user)
    amount: string;
    unit: string;
    importance?: 'required' | 'optional';
  }>;
  steps: Array<{
    stepNumber: number;
    instruction: string; // Tiếng Việt
    duration: number;
  }>;
  cookingTime: number;
  difficulty: string; // Tiếng Việt: "dễ", "trung bình", "khó"
  servings: number;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number; // Optional - chỉ hiển thị khi > 0
  };
}

interface IngredientAnalysis {
  compatibleIngredients: string[];
  incompatibleIngredients: string[];
  compatibilityNote: string;
  separateSearchSuggestion?: string; // Gợi ý tìm riêng cho nguyên liệu không phù hợp
}

interface AIResponse {
  analysis: IngredientAnalysis;
  recipes: AIRecipe[];
}

interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  sugar?: number;
}

// Unit conversions to grams
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  kg: 1000,
  ml: 1,
  liter: 1000,
  l: 1000,
  tablespoon: 15,
  tbsp: 15,
  teaspoon: 5,
  tsp: 5,
  cup: 240,
  piece: 100,
  pieces: 100,
  // Vietnamese units
  thìa: 15, // tablespoon
  muỗng: 15, // tablespoon
  'muỗng canh': 15,
  'muỗng cà phê': 5,
  củ: 100, // root vegetable
  tép: 5, // clove (garlic)
  trái: 50, // fruit
  quả: 50, // fruit
  cây: 20, // stalk
  lá: 2, // leaf
  bó: 50, // bunch
  miếng: 100, // piece
  cái: 100, // piece
  chén: 200, // bowl
  cốc: 240, // cup
};

// Fallback nutrition estimates for common ingredient categories (per 100g)
// Used when Dictionary/Translation Cache lookup fails
const FALLBACK_NUTRITION: Record<string, NutritionPer100g> = {
  // Proteins
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
  pork: { calories: 242, protein: 27, carbs: 0, fat: 14, fiber: 0 },
  beef: { calories: 250, protein: 26, carbs: 0, fat: 15, fiber: 0 },
  fish: { calories: 120, protein: 22, carbs: 0, fat: 3, fiber: 0 },
  shrimp: { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0 },
  egg: { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 },
  tofu: { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
  // Vegetables
  vegetable: { calories: 25, protein: 2, carbs: 5, fat: 0.3, fiber: 2 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 },
  garlic: { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, fiber: 2.1 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  carrot: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8 },
  // Grains & Starches
  rice: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
  noodle: { calories: 138, protein: 4.5, carbs: 25, fat: 2.1, fiber: 1.2 },
  // Condiments (per 100g, but typically used in small amounts)
  'fish-sauce': { calories: 35, protein: 5.1, carbs: 3.6, fat: 0, fiber: 0 },
  'soy-sauce': { calories: 53, protein: 8.1, carbs: 4.9, fat: 0, fiber: 0 },
  sugar: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
  salt: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  oil: { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  // Default fallback
  default: { calories: 50, protein: 2, carbs: 8, fat: 1, fiber: 1 },
};

export class AIWorker {
  private bedrockClient: BedrockRuntimeClient;
  private cacheService: AICacheService;
  private dynamoClient: DynamoDBDocumentClient;
  private modelId: string;
  private tableName: string;

  constructor() {
    // Validate required environment variables
    const region = process.env.AWS_REGION;
    const bedrockRegion = process.env.BEDROCK_REGION || region;
    const modelId = process.env.BEDROCK_MODEL_ID;
    const tableName = process.env.DYNAMODB_TABLE;

    if (!region) {
      throw new Error('AWS_REGION environment variable is required');
    }
    if (!modelId) {
      throw new Error('BEDROCK_MODEL_ID environment variable is required');
    }
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE environment variable is required');
    }

    this.bedrockClient = new BedrockRuntimeClient({ region: bedrockRegion });
    this.cacheService = new AICacheService(tableName);

    // Initialize DynamoDB client for nutrition lookup
    const dynamoClient = new DynamoDBClient({ region });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoClient);

    this.modelId = modelId;
    this.tableName = tableName;
  }

  /**
   * Process SQS messages from AIQueue
   *
   * @param event - SQS event with AI job messages
   */
  async handler(event: SQSEvent): Promise<void> {
    console.log('AI Worker processing', { messageCount: event.Records.length });

    for (const record of event.Records) {
      try {
        await this.processMessage(record);
      } catch (error) {
        console.error('Failed to process message', {
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Let SQS retry or send to DLQ
        throw error;
      }
    }
  }

  /**
   * Process a single AI job message
   *
   * @param record - SQS record
   */
  private async processMessage(record: SQSRecord): Promise<void> {
    const message: AIJobMessage = JSON.parse(record.body);
    const startTime = Date.now();

    console.log('Processing AI job', {
      jobId: message.jobId,
      userId: message.userId,
      ingredients: message.ingredients,
    });

    // 1. Generate recipes via Bedrock AI (with ingredient analysis)
    const { recipes, analysis } = await this.generateRecipes(message);

    // Log ingredient compatibility analysis
    if (analysis) {
      console.log('Ingredient analysis result', {
        jobId: message.jobId,
        compatible: analysis.compatibleIngredients,
        incompatible: analysis.incompatibleIngredients,
        note: analysis.compatibilityNote,
      });
    }

    // 2. Calculate nutrition for each recipe
    const recipesWithNutrition = await this.addNutritionToRecipes(recipes);

    // 3. Extract ALL unique ingredients from generated recipes
    const allRecipeIngredients = this.extractAllIngredients(recipesWithNutrition);

    // 3.5. NEW: Add new ingredients from AI to Translation Cache (1 year TTL)
    await this.addNewIngredientsToCache(recipesWithNutrition, message.ingredients);

    // 4. Generate NEW cache key based on AI recipe ingredients (not user input)
    const aiBasedCacheKey = this.generateAICacheKey(allRecipeIngredients, message.settings);

    console.log('Cache key strategy', {
      jobId: message.jobId,
      userInputCacheKey: message.cacheKey,
      aiBasedCacheKey,
      userInputIngredients: message.ingredients,
      aiRecipeIngredients: allRecipeIngredients,
    });

    // 5. Store in AI Cache with AI-based cache key (after recipe generation)
    //    - Primary key: AI recipe ingredients (not user input) - for better cache hit
    //    - Secondary key: Full recipe ingredients (partial match via GSI4)
    await this.cacheService.store({
      cacheKey: aiBasedCacheKey, // AI-based cache key (after recipe generation)
      recipes: recipesWithNutrition,
      userInputIngredients: message.ingredients, // Original user input
      allRecipeIngredients, // All ingredients from AI recipes
      settings: message.settings,
    });

    // 6. Check if any recipes exceed maxTime (for warning)
    const maxTime = message.settings.maxTime || 60;
    const validRecipes = recipesWithNutrition.filter((r) => r.cookingTime <= maxTime);
    const exceededRecipes = recipesWithNutrition.filter((r) => r.cookingTime > maxTime);

    // Build warnings array
    const warnings: string[] = [];

    // Warning for exceeded time
    if (exceededRecipes.length > 0) {
      const minExceededTime = Math.min(...exceededRecipes.map((r) => r.cookingTime));
      warnings.push(
        `${exceededRecipes.length} công thức vượt quá ${maxTime} phút. Tăng thời gian lên ${minExceededTime} phút để xem thêm.`
      );
    }

    // Warning for incompatible ingredients
    if (analysis?.incompatibleIngredients && analysis.incompatibleIngredients.length > 0) {
      let incompatibleWarning = `Nguyên liệu không phù hợp đã bị loại bỏ: ${analysis.incompatibleIngredients.join(', ')}.`;
      if (analysis.compatibilityNote) {
        incompatibleWarning += ` ${analysis.compatibilityNote}`;
      }
      if (analysis.separateSearchSuggestion) {
        incompatibleWarning += ` 💡 Gợi ý: ${analysis.separateSearchSuggestion}`;
      }
      warnings.push(incompatibleWarning);
    }

    const warning = warnings.length > 0 ? warnings.join(' | ') : undefined;

    const duration = Date.now() - startTime;
    console.log('AI job completed', {
      jobId: message.jobId,
      recipeCount: recipesWithNutrition.length,
      validCount: validRecipes.length,
      exceededCount: exceededRecipes.length,
      incompatibleIngredients: analysis?.incompatibleIngredients || [],
      duration,
      hasNutrition: recipesWithNutrition.every((r) => r.nutrition),
      warning,
    });

    // 6. Update job status in DynamoDB (with warning and analysis)
    await this.updateJobStatus(
      message.jobId,
      message.userId,
      'COMPLETED',
      recipesWithNutrition,
      warning,
      analysis
    );
  }

  /**
   * Generate recipes via Bedrock AI with ingredient compatibility analysis
   *
   * @param message - AI job message
   * @returns Object with analysis and recipes
   */
  private async generateRecipes(message: AIJobMessage): Promise<{
    recipes: AIRecipe[];
    analysis?: IngredientAnalysis;
  }> {
    const prompt = this.buildPrompt(message);

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const responseText = responseBody.content[0].text;

    // Parse AI response (may include analysis)
    const recipes = this.parseAIResponse(responseText);

    // Try to extract analysis separately
    let analysis: IngredientAnalysis | undefined;
    try {
      const objectMatch = responseText.match(/\{[\s\S]*"analysis"[\s\S]*\}/);
      if (objectMatch) {
        const parsed = JSON.parse(objectMatch[0]);
        if (parsed.analysis) {
          analysis = parsed.analysis;
        }
      }
    } catch {
      // Analysis extraction failed, continue without it
    }

    // Log all recipes before filtering
    console.log('AI generated recipes (before filtering)', {
      maxTime: message.settings.maxTime || 60,
      hasAnalysis: !!analysis,
      incompatibleIngredients: analysis?.incompatibleIngredients || [],
      recipes: recipes.map((r) => ({
        name: typeof r.name === 'string' ? r.name : r.name?.vietnamese || r.name?.english,
        cookingTime: r.cookingTime,
        usedIngredients: r.usedIngredients,
      })),
    });

    // Sort all recipes by cooking time (fastest first)
    const sortedRecipes = recipes.sort((a, b) => a.cookingTime - b.cookingTime);

    // Log filtering info
    const maxTime = message.settings.maxTime || 60;
    const validRecipes = sortedRecipes.filter((r) => r.cookingTime <= maxTime);
    const exceededRecipes = sortedRecipes.filter((r) => r.cookingTime > maxTime);

    if (exceededRecipes.length > 0) {
      console.log('Some recipes exceed maxTime', {
        maxTime,
        validCount: validRecipes.length,
        exceededCount: exceededRecipes.length,
        exceededRecipes: exceededRecipes.map((r) => ({
          name: typeof r.name === 'string' ? r.name : r.name?.vietnamese || r.name?.english,
          cookingTime: r.cookingTime,
        })),
      });
    }

    // Return 1 recipe only (fastest) with analysis
    return {
      recipes: sortedRecipes.slice(0, 1),
      analysis,
    };
  }

  /**
   * Extract all unique ingredients from generated recipes
   *
   * @param recipes - Array of AI-generated recipes
   * @returns Array of unique normalized ingredient names
   */
  private extractAllIngredients(recipes: AIRecipe[]): string[] {
    const allIngredients = new Set<string>();

    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        // Normalize ingredient name (already in English from AI)
        const normalized = ingredient.name.toLowerCase().replace(/\s+/g, '-');
        allIngredients.add(normalized);
      }
    }

    return Array.from(allIngredients).sort();
  }

  /**
   * Build prompt for Bedrock AI - Optimized for speed (1 recipe only)
   *
   * Output format:
   * - name: Tiếng Việt only (không cần English)
   * - description: Tiếng Việt
   * - ingredients.name: English (cho cache key lookup)
   * - ingredients.vietnameseName: Tiếng Việt (hiển thị)
   * - steps: Tiếng Việt
   *
   * @param message - AI job message
   * @returns Prompt string
   */
  private buildPrompt(message: AIJobMessage): string {
    const { ingredients, settings } = message;
    const dislikedIngredients = settings.dislikedIngredients || [];
    const preferredMethods = settings.preferredCookingMethods?.filter((m) => m !== 'none') || [];

    // Map mealType to Vietnamese
    const mealTypeMap: Record<string, string> = {
      breakfast: 'bữa sáng',
      lunch: 'bữa trưa',
      dinner: 'bữa tối',
      snack: 'ăn vặt',
      none: '',
    };
    const mealTypeVn = mealTypeMap[settings.mealType] || '';

    // Build requirements string
    let requirements = `${settings.servings} người`;

    // Thêm bữa ăn nếu có
    if (mealTypeVn) {
      requirements += `, cho ${mealTypeVn}`;
    }

    // Thêm thời gian
    requirements += `, ≤${settings.maxTime} phút`;

    // Thêm phương pháp nấu nếu có
    if (preferredMethods.length > 0) {
      requirements += `, phương pháp: ${preferredMethods.join('/')}`;
    }

    // Thêm nguyên liệu tránh nếu có
    if (dislikedIngredients.length > 0) {
      requirements += `, tránh: ${dislikedIngredients.join(', ')}`;
    }

    return `Bạn là đầu bếp Việt Nam chuyên nghiệp với 20 năm kinh nghiệm. Tạo 1 món ăn Việt Nam TỐT NHẤT từ nguyên liệu: ${ingredients.join(', ')}

Yêu cầu: ${requirements}${preferredMethods.length > 0 ? `\n\n⚠️ ƯU TIÊN PHƯƠNG PHÁP NẤU: ${preferredMethods.join(', ')} - Dù thời gian có thể lâu hơn ${settings.maxTime} phút cũng được nếu cần thiết cho phương pháp này.` : ''}${mealTypeVn ? `\n\n🍽️ LƯU Ý BỮA ĂN: Món này phù hợp cho ${mealTypeVn}, hãy điều chỉnh khẩu phần và độ nặng nhẹ phù hợp.` : ''}

⚠️ PHÂN TÍCH NGUYÊN LIỆU:
1. Kiểm tra TẤT CẢ nguyên liệu có thể kết hợp được không
2. Nếu có nguyên liệu KHÔNG TƯƠNG THÍCH (vd: trái cây ngọt như dưa hấu/thanh long + thịt mặn), hãy:
   - LOẠI BỎ khỏi công thức
   - Ghi vào incompatibleIngredients
   - Ghi rõ lý do trong compatibilityNote
   - Đề xuất user tìm riêng trong separateSearchSuggestion

Trả về JSON (CHỈ 1 MÓN):
{
  "analysis": {
    "compatibleIngredients": ["chicken", "scallion"],
    "incompatibleIngredients": ["watermelon"],
    "compatibilityNote": "Dưa hấu không phù hợp với món mặn",
    "separateSearchSuggestion": "Tìm riêng món tráng miệng với dưa hấu"
  },
  "recipes": [{
    "name": "Gà Xào Sả Ớt",
    "description": "Món gà xào thơm ngon với sả và ớt, đậm đà hương vị Việt Nam",
    "usedIngredients": ["chicken", "scallion", "lemongrass"],
    "ingredients": [
      {"name": "chicken", "vietnameseName": "Thịt gà", "amount": "500", "unit": "g", "importance": "required"},
      {"name": "scallion", "vietnameseName": "Hành lá", "amount": "50", "unit": "g", "importance": "required"},
      {"name": "fish-sauce", "vietnameseName": "Nước mắm", "amount": "2", "unit": "tbsp", "importance": "required"},
      {"name": "garlic", "vietnameseName": "Tỏi", "amount": "3", "unit": "tép", "importance": "optional"}
    ],
    "steps": [
      {"stepNumber": 1, "instruction": "Rửa sạch thịt gà, chặt miếng vừa ăn", "duration": 5},
      {"stepNumber": 2, "instruction": "Ướp gà với nước mắm, tiêu trong 15 phút", "duration": 15},
      {"stepNumber": 3, "instruction": "Phi thơm tỏi, cho gà vào xào trên lửa lớn", "duration": 10}
    ],
    "cookingTime": 30,
    "difficulty": "dễ",
    "servings": ${settings.servings}
  }]
}

📋 QUY TẮC QUAN TRỌNG:
1. name: CHỈ tiếng Việt (vd: "Gà Xào Sả Ớt"), KHÔNG cần object {vietnamese, english}
2. description: Tiếng Việt
3. ingredients.name: English lowercase-hyphen (vd: "chicken", "fish-sauce") - dùng cho cache key
4. ingredients.vietnameseName: Tiếng Việt (vd: "Thịt gà", "Nước mắm") - hiển thị cho user
5. steps.instruction: Tiếng Việt chi tiết
6. importance: "required" cho nguyên liệu chính, "optional" cho gia vị
7. cookingTime ≤ ${settings.maxTime}
8. usedIngredients: danh sách English ingredients THỰC SỰ dùng trong món
9. CHỈ TRẢ VỀ JSON, KHÔNG giải thích thêm`;
  }

  /**
   * Parse AI response into structured recipes with ingredient analysis
   *
   * Supports two formats:
   * 1. New format: { analysis: {...}, recipes: [...] }
   * 2. Legacy format: [...] (array of recipes)
   *
   * @param responseText - AI response text
   * @returns Object with analysis and recipes
   */
  private parseAIResponse(responseText: string): AIRecipe[] {
    try {
      // Try to extract JSON object first (new format with analysis)
      const objectMatch = responseText.match(/\{[\s\S]*"recipes"[\s\S]*\}/);

      if (objectMatch) {
        const parsed: AIResponse = JSON.parse(objectMatch[0]);

        // Log ingredient analysis
        if (parsed.analysis) {
          console.log('Ingredient compatibility analysis', {
            compatible: parsed.analysis.compatibleIngredients,
            incompatible: parsed.analysis.incompatibleIngredients,
            note: parsed.analysis.compatibilityNote,
          });

          // Warn if incompatible ingredients found
          if (parsed.analysis.incompatibleIngredients?.length > 0) {
            console.warn('Incompatible ingredients detected', {
              ingredients: parsed.analysis.incompatibleIngredients,
              reason: parsed.analysis.compatibilityNote,
            });
          }
        }

        if (Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
          return parsed.recipes;
        }
      }

      // Fallback: Try to extract JSON array (legacy format)
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const recipes = JSON.parse(arrayMatch[0]);

        if (Array.isArray(recipes) && recipes.length > 0) {
          console.log('Parsed legacy format (no analysis)', { recipeCount: recipes.length });
          return recipes;
        }
      }

      console.error('Failed to parse AI response', {
        error: 'No valid JSON found in AI response',
        responseText: responseText.substring(0, 500),
      });
      throw new Error('No valid JSON found in AI response');
    } catch (error) {
      // Re-throw if it's already our custom error
      if (error instanceof Error && error.message.includes('No valid JSON')) {
        throw error;
      }

      // Otherwise, log and throw generic error
      console.error('Failed to parse AI response', {
        error: error instanceof Error ? error.message : String(error),
        responseText: responseText.substring(0, 500),
      });
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Add nutrition to recipes by calculating from Dictionary/Translation Cache
   *
   * @param recipes - AI-generated recipes
   * @returns Recipes with nutrition data
   */
  private async addNutritionToRecipes(recipes: AIRecipe[]): Promise<AIRecipe[]> {
    const recipesWithNutrition: AIRecipe[] = [];

    for (const recipe of recipes) {
      try {
        const nutrition = await this.calculateRecipeNutrition(recipe.ingredients, recipe.servings);
        recipesWithNutrition.push({
          ...recipe,
          nutrition,
        });
      } catch (error) {
        console.error('Failed to calculate nutrition for recipe', {
          recipe: recipe.name,
          error: error instanceof Error ? error.message : String(error),
        });
        // Store recipe without nutrition if calculation fails
        recipesWithNutrition.push(recipe);
      }
    }

    return recipesWithNutrition;
  }

  /**
   * Calculate nutrition for a recipe
   *
   * @param ingredients - Recipe ingredients with amounts
   * @param servings - Number of servings
   * @returns Nutrition per serving
   */
  private async calculateRecipeNutrition(
    ingredients: Array<{ name: string; amount: string; unit: string }>,
    servings: number
  ): Promise<{ calories: number; protein: number; carbs: number; fat: number; fiber?: number }> {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    for (const ingredient of ingredients) {
      try {
        // 1. Lookup nutrition from Dictionary/Translation Cache
        let nutritionPer100g = await this.lookupNutrition(ingredient.name);

        // 2. Fallback to estimated nutrition if not found
        if (!nutritionPer100g) {
          nutritionPer100g = this.getFallbackNutrition(ingredient.name);
          console.warn('Using fallback nutrition for ingredient', {
            ingredient: ingredient.name,
            fallback: nutritionPer100g ? 'found' : 'default',
          });
        }

        // 2. Convert amount to grams
        const amountValue = parseFloat(ingredient.amount);
        if (isNaN(amountValue)) {
          console.warn('Invalid amount for ingredient', {
            ingredient: ingredient.name,
            amount: ingredient.amount,
          });
          continue;
        }

        const gramsPerUnit = UNIT_TO_GRAMS[ingredient.unit.toLowerCase()] || 1;
        const totalGrams = amountValue * gramsPerUnit;

        // 3. Calculate nutrition (multiplier = grams / 100)
        const multiplier = totalGrams / 100;

        totalCalories += nutritionPer100g.calories * multiplier;
        totalProtein += nutritionPer100g.protein * multiplier;
        totalCarbs += nutritionPer100g.carbs * multiplier;
        totalFat += nutritionPer100g.fat * multiplier;
        totalFiber += (nutritionPer100g.fiber || 0) * multiplier;
      } catch (error) {
        console.error('Failed to calculate nutrition for ingredient', {
          ingredient: ingredient.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 4. Calculate per serving
    const fiberPerServing = Math.round((totalFiber / servings) * 10) / 10;
    return {
      calories: Math.round((totalCalories / servings) * 10) / 10,
      protein: Math.round((totalProtein / servings) * 10) / 10,
      carbs: Math.round((totalCarbs / servings) * 10) / 10,
      fat: Math.round((totalFat / servings) * 10) / 10,
      // Chỉ trả về fiber nếu có giá trị > 0
      ...(fiberPerServing > 0 && { fiber: fiberPerServing }),
    };
  }

  /**
   * Lookup nutrition data from Dictionary or Translation Cache
   *
   * Strategy:
   * 1. Try Dictionary via GSI5 (GSI5PK = english-name, GSI5SK = 'DICTIONARY')
   * 2. Try Translation Cache via GSI5 (GSI5PK = english-name, GSI5SK = 'TRANSLATION_CACHE')
   *
   * Note: Dictionary SK uses Vietnamese normalized, so we lookup via GSI5 by English name
   *
   * @param ingredientName - English ingredient name (normalized)
   * @returns Nutrition per 100g or null
   */
  private async lookupNutrition(ingredientName: string): Promise<NutritionPer100g | null> {
    try {
      // Normalize ingredient name (lowercase, hyphens)
      const normalized = ingredientName.toLowerCase().replace(/\s+/g, '-');

      // Try Dictionary via GSI5 (GSI5PK = english-name, GSI5SK = 'DICTIONARY')
      const dictResult = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI5',
          KeyConditionExpression: 'GSI5PK = :english AND GSI5SK = :sk',
          ExpressionAttributeValues: {
            ':english': normalized,
            ':sk': 'DICTIONARY',
          },
          Limit: 1,
        })
      );

      if (dictResult.Items && dictResult.Items.length > 0) {
        const dictEntry = dictResult.Items[0];
        if (dictEntry.nutrition) {
          return dictEntry.nutrition.per100g as NutritionPer100g;
        }
      }

      // Try Translation Cache via GSI5 (GSI5PK = english-name, GSI5SK = 'TRANSLATION_CACHE')
      const cacheResult = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI5',
          KeyConditionExpression: 'GSI5PK = :english AND GSI5SK = :sk',
          ExpressionAttributeValues: {
            ':english': normalized,
            ':sk': 'TRANSLATION_CACHE',
          },
          Limit: 1,
        })
      );

      if (cacheResult.Items && cacheResult.Items.length > 0) {
        const cacheEntry = cacheResult.Items[0];
        if (cacheEntry.nutrition) {
          return cacheEntry.nutrition.per100g as NutritionPer100g;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to lookup nutrition', {
        ingredient: ingredientName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get fallback nutrition estimate for ingredient when lookup fails
   *
   * Matches ingredient name against known categories to provide reasonable estimates.
   * Falls back to default values if no match found.
   *
   * @param ingredientName - English ingredient name
   * @returns Estimated nutrition per 100g
   */
  private getFallbackNutrition(ingredientName: string): NutritionPer100g {
    const normalized = ingredientName.toLowerCase().replace(/-/g, ' ');

    // Check for exact match first
    const exactKey = ingredientName.toLowerCase().replace(/\s+/g, '-');
    if (FALLBACK_NUTRITION[exactKey]) {
      return FALLBACK_NUTRITION[exactKey];
    }

    // Check for category matches
    if (normalized.includes('chicken') || normalized.includes('ga')) {
      return FALLBACK_NUTRITION.chicken;
    }
    if (normalized.includes('pork') || normalized.includes('heo') || normalized.includes('lon')) {
      return FALLBACK_NUTRITION.pork;
    }
    if (normalized.includes('beef') || normalized.includes('bo')) {
      return FALLBACK_NUTRITION.beef;
    }
    if (normalized.includes('fish') || normalized.includes('ca')) {
      return FALLBACK_NUTRITION.fish;
    }
    if (normalized.includes('shrimp') || normalized.includes('tom')) {
      return FALLBACK_NUTRITION.shrimp;
    }
    if (normalized.includes('egg') || normalized.includes('trung')) {
      return FALLBACK_NUTRITION.egg;
    }
    if (normalized.includes('tofu') || normalized.includes('dau')) {
      return FALLBACK_NUTRITION.tofu;
    }
    if (normalized.includes('rice') || normalized.includes('gao') || normalized.includes('com')) {
      return FALLBACK_NUTRITION.rice;
    }
    if (normalized.includes('noodle') || normalized.includes('mi') || normalized.includes('bun')) {
      return FALLBACK_NUTRITION.noodle;
    }
    if (normalized.includes('onion') || normalized.includes('hanh')) {
      return FALLBACK_NUTRITION.onion;
    }
    if (normalized.includes('garlic') || normalized.includes('toi')) {
      return FALLBACK_NUTRITION.garlic;
    }
    if (normalized.includes('tomato') || normalized.includes('ca chua')) {
      return FALLBACK_NUTRITION.tomato;
    }
    if (normalized.includes('carrot') || normalized.includes('ca rot')) {
      return FALLBACK_NUTRITION.carrot;
    }
    if (normalized.includes('fish sauce') || normalized.includes('nuoc mam')) {
      return FALLBACK_NUTRITION['fish-sauce'];
    }
    if (normalized.includes('soy sauce') || normalized.includes('xi dau')) {
      return FALLBACK_NUTRITION['soy-sauce'];
    }
    if (normalized.includes('sugar') || normalized.includes('duong')) {
      return FALLBACK_NUTRITION.sugar;
    }
    if (normalized.includes('salt') || normalized.includes('muoi')) {
      return FALLBACK_NUTRITION.salt;
    }
    if (normalized.includes('oil') || normalized.includes('dau an')) {
      return FALLBACK_NUTRITION.oil;
    }

    // Default fallback for unknown ingredients
    return FALLBACK_NUTRITION.default;
  }

  /**
   * Update job status in DynamoDB for polling endpoint
   *
   * @param jobId - Job ID
   * @param userId - User ID
   * @param status - Job status
   * @param result - Recipes (if completed)
   * @param errorOrWarning - Error message (if failed) or warning (if completed)
   * @param analysis - Ingredient compatibility analysis
   */
  private async updateJobStatus(
    jobId: string,
    userId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    result?: AIRecipe[],
    errorOrWarning?: string,
    analysis?: IngredientAnalysis
  ): Promise<void> {
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 7 * 24 * 60 * 60; // 7 days TTL

    const item: Record<string, any> = {
      PK: `JOB#${jobId}`,
      SK: 'STATUS',
      jobId,
      userId,
      status,
      createdAt: now,
      completedAt: status === 'COMPLETED' || status === 'FAILED' ? now : undefined,
      ttl,
    };

    if (result) {
      item.result = result;
    }

    // Add ingredient analysis if available
    if (analysis) {
      item.ingredientAnalysis = {
        compatibleIngredients: analysis.compatibleIngredients || [],
        incompatibleIngredients: analysis.incompatibleIngredients || [],
        compatibilityNote: analysis.compatibilityNote || '',
        separateSearchSuggestion: analysis.separateSearchSuggestion || '',
      };
    }

    // For FAILED status, it's an error. For COMPLETED with message, it's a warning
    if (errorOrWarning) {
      if (status === 'FAILED') {
        item.error = errorOrWarning;
      } else if (status === 'COMPLETED') {
        item.warning = errorOrWarning;
      }
    }

    await this.dynamoClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );

    console.log('Job status updated', { jobId, status, hasAnalysis: !!analysis });
  }

  /**
   * Generate cache key based on AI recipe ingredients (after recipe generation)
   * This ensures cache key reflects actual recipe content, not just user input
   *
   * @param recipeIngredients - Ingredients from AI-generated recipe
   * @param settings - Recipe settings
   * @returns Cache key string
   */
  private generateAICacheKey(
    recipeIngredients: string[],
    settings: AIJobMessage['settings']
  ): string {
    const sortedIngredients = [...recipeIngredients].sort().join('|');
    const servings = settings.servings || 2;
    const mealType = settings.mealType || 'none';
    const maxTime = settings.maxTime || 60;

    return `${sortedIngredients}|s${servings}|${mealType}|t${maxTime}`;
  }

  /**
   * Add new ingredients from AI recipe to Translation Cache (1 year TTL)
   * ONLY adds ingredients that have BOTH Vietnamese AND English names
   *
   * Logic:
   * - AI recipe trả về ingredients với name (English) và vietnameseName (Vietnamese)
   * - Chỉ lưu Translation Cache khi có vietnameseName (Vietnamese source)
   * - Nếu không có vietnameseName → Skip (không có Vietnamese source để lookup sau này)
   *
   * @param recipes - AI-generated recipes
   * @param userInputIngredients - Original user input ingredients (already in cache)
   */
  private async addNewIngredientsToCache(
    recipes: AIRecipe[],
    userInputIngredients: string[]
  ): Promise<void> {
    const userInputSet = new Set(userInputIngredients.map((i) => i.toLowerCase()));
    const newIngredients: Array<{ english: string; vietnamese: string }> = [];

    // Extract all ingredients from recipes
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const englishName = ingredient.name.toLowerCase().replace(/\s+/g, '-');

        // IMPORTANT: Only process if vietnameseName exists (has Vietnamese source)
        // If no vietnameseName, we can't create a proper Translation Cache entry
        if (!ingredient.vietnameseName) {
          console.log('Skipping ingredient without Vietnamese name', { english: englishName });
          continue;
        }

        const vietnameseName = ingredient.vietnameseName;

        // Skip if already in user input
        if (userInputSet.has(englishName)) continue;

        // Check if already exists in Dictionary or Translation Cache (by English via GSI5)
        const exists = await this.checkIngredientExists(englishName);
        if (!exists) {
          newIngredients.push({ english: englishName, vietnamese: vietnameseName });
        }
      }
    }

    if (newIngredients.length === 0) {
      console.log('No new ingredients with Vietnamese names to add to Translation Cache');
      return;
    }

    console.log('Adding new ingredients to Translation Cache', {
      count: newIngredients.length,
      ingredients: newIngredients,
    });

    // Add each new ingredient to Translation Cache
    for (const ingredient of newIngredients) {
      try {
        await this.addIngredientToTranslationCache(ingredient.english, ingredient.vietnamese);
      } catch (error) {
        console.error('Failed to add ingredient to Translation Cache', {
          ingredient,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check if ingredient exists in Dictionary or Translation Cache
   *
   * @param englishName - English ingredient name (normalized)
   * @returns true if exists
   */
  private async checkIngredientExists(englishName: string): Promise<boolean> {
    try {
      // Check via GSI5 (both Dictionary and Translation Cache)
      const result = await this.dynamoClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI5',
          KeyConditionExpression: 'GSI5PK = :english',
          ExpressionAttributeValues: {
            ':english': englishName,
          },
          Limit: 1,
        })
      );

      return (result.Items && result.Items.length > 0) || false;
    } catch (error) {
      console.error('Failed to check ingredient existence', {
        ingredient: englishName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Add ingredient to Translation Cache with nutrition data
   * Format matches bootstrap-dictionary.py for consistency
   *
   * @param englishName - English ingredient name (normalized)
   * @param vietnameseName - Vietnamese ingredient name
   */
  private async addIngredientToTranslationCache(
    englishName: string,
    vietnameseName: string
  ): Promise<void> {
    const normalizedVn = this.normalizeVietnamese(vietnameseName);
    const normalizedEn = englishName.toLowerCase().replace(/\s+/g, '-');
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
    const timestamp = Date.now();

    // Get nutrition data for the ingredient
    const nutrition = await this.lookupNutrition(englishName);

    // Format matches bootstrap-dictionary.py
    const entry: Record<string, any> = {
      PK: 'TRANSLATION_CACHE',
      SK: `INGREDIENT#${normalizedVn}`, // Vietnamese normalized for lookup
      source: vietnameseName, // Original Vietnamese with accents
      sourceNormalized: normalizedVn,
      englishNormalized: normalizedEn, // Keep English for reference
      target: {
        specific: normalizedEn,
        general: normalizedEn,
        category: 'other', // Default category
      },
      addedBy: 'AI',
      addedAt: timestamp,
      usageCount: 1,
      lastUsed: timestamp,
      ttl,
      // GSI5 for English lookup (ai-worker uses this)
      GSI5PK: normalizedEn, // English normalized (lowercase-hyphen)
      GSI5SK: 'TRANSLATION_CACHE',
    };

    // Add nutrition data if available (format matches bootstrap)
    if (nutrition) {
      entry.nutrition = {
        per100g: {
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          fiber: nutrition.fiber || 0,
        },
        dataSource: 'AI',
      };
    }

    await this.dynamoClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: entry,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      })
    );

    console.log('New ingredient added to Translation Cache (bootstrap format)', {
      vietnamese: vietnameseName,
      normalizedVn,
      english: normalizedEn,
      hasNutrition: !!nutrition,
    });
  }

  /**
   * Normalize Vietnamese text for Dictionary lookup
   *
   * @param text - Vietnamese text to normalize
   * @returns Normalized text
   */
  private normalizeVietnamese(text: string): string {
    let normalized = text.toLowerCase();

    const accents: Record<string, string> = {
      à: 'a',
      á: 'a',
      ả: 'a',
      ã: 'a',
      ạ: 'a',
      ă: 'a',
      ằ: 'a',
      ắ: 'a',
      ẳ: 'a',
      ẵ: 'a',
      ặ: 'a',
      â: 'a',
      ầ: 'a',
      ấ: 'a',
      ẩ: 'a',
      ẫ: 'a',
      ậ: 'a',
      đ: 'd',
      è: 'e',
      é: 'e',
      ẻ: 'e',
      ẽ: 'e',
      ẹ: 'e',
      ê: 'e',
      ề: 'e',
      ế: 'e',
      ể: 'e',
      ễ: 'e',
      ệ: 'e',
      ì: 'i',
      í: 'i',
      ỉ: 'i',
      ĩ: 'i',
      ị: 'i',
      ò: 'o',
      ó: 'o',
      ỏ: 'o',
      õ: 'o',
      ọ: 'o',
      ô: 'o',
      ồ: 'o',
      ố: 'o',
      ổ: 'o',
      ỗ: 'o',
      ộ: 'o',
      ơ: 'o',
      ờ: 'o',
      ớ: 'o',
      ở: 'o',
      ỡ: 'o',
      ợ: 'o',
      ù: 'u',
      ú: 'u',
      ủ: 'u',
      ũ: 'u',
      ụ: 'u',
      ư: 'u',
      ừ: 'u',
      ứ: 'u',
      ử: 'u',
      ữ: 'u',
      ự: 'u',
      ỳ: 'y',
      ý: 'y',
      ỷ: 'y',
      ỹ: 'y',
      ỵ: 'y',
    };

    for (const [accented, plain] of Object.entries(accents)) {
      normalized = normalized.replace(new RegExp(accented, 'g'), plain);
    }

    return normalized
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

// Lambda handler
const worker = new AIWorker();

export const handler = async (event: SQSEvent): Promise<void> => {
  await worker.handler(event);
};
