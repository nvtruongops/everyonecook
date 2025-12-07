/**
 * Nutrition Lookup Service
 *
 * Shared service for ingredient translation and nutrition lookup.
 * Implements 3-tier lookup strategy: Dictionary → Translation Cache → AI
 *
 * @see .kiro/specs/project-restructure/ai-services-design.md
 */

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Translation target structure
 */
export interface Translation {
  specific: string;
  general: string;
  category: string;
}

/**
 * Nutrition data structure
 */
export interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface NutritionData {
  per100g: NutritionPer100g;
  dataSource: 'AI' | 'USDA' | 'DICTIONARY';
}

/**
 * Ingredient lookup result
 */
export interface IngredientLookupResult {
  vietnamese: string;
  english: Translation;
  nutrition?: NutritionData;
  source: 'dictionary' | 'cache' | 'ai';
}

/**
 * Nutrition Lookup Service
 */
export class NutritionLookupService {
  constructor(
    private docClient: DynamoDBDocumentClient,
    private bedrockClient: BedrockRuntimeClient,
    private tableName: string,
    private modelId: string
  ) {}

  /**
   * Normalize Vietnamese text for Dictionary lookup
   */
  normalizeVietnamese(text: string): string {
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

    normalized = normalized.replace(/\s+/g, '-');
    normalized = normalized.replace(/[^a-z0-9-]/g, '');
    normalized = normalized.replace(/-+/g, '-');
    normalized = normalized.replace(/^-+|-+$/g, '');

    return normalized;
  }

  /**
   * Lookup ingredient in Dictionary
   */
  async lookupDictionary(
    normalized: string
  ): Promise<{ translation: Translation; nutrition?: NutritionData } | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: 'DICTIONARY',
            SK: `INGREDIENT#${normalized}`,
          },
        })
      );

      if (result.Item) {
        return {
          translation: result.Item.target as Translation,
          nutrition: result.Item.nutrition as NutritionData | undefined,
        };
      }

      return null;
    } catch (error) {
      console.error('Dictionary lookup failed:', { normalized, error });
      return null;
    }
  }

  /**
   * Lookup ingredient in Translation Cache
   */
  async lookupTranslationCache(
    normalized: string
  ): Promise<{ translation: Translation; nutrition?: NutritionData } | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: 'TRANSLATION_CACHE',
            SK: `INGREDIENT#${normalized}`,
          },
        })
      );

      if (result.Item) {
        const now = Math.floor(Date.now() / 1000);
        if (result.Item.ttl && result.Item.ttl > now) {
          // Increment usage count
          this.incrementTranslationUsage(normalized).catch(() => {});

          return {
            translation: result.Item.target as Translation,
            nutrition: result.Item.nutrition as NutritionData | undefined,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Translation Cache lookup failed:', { normalized, error });
      return null;
    }
  }

  /**
   * Translate ingredient using AI
   */
  async translateWithAI(vietnamese: string): Promise<string> {
    const prompt = `Translate this Vietnamese ingredient to English. Return ONLY the English name, nothing else.

Vietnamese ingredient: ${vietnamese}

English translation:`;

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 50,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return responseBody.content[0].text.trim().toLowerCase();
  }

  /**
   * Get nutrition data using AI
   */
  async getNutritionWithAI(ingredientEnglish: string): Promise<NutritionData> {
    try {
      const prompt = `You are a nutrition expert. Provide estimated nutrition data per 100g for: "${ingredientEnglish}"

Return ONLY a JSON object with this exact format (no explanation):
{"calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>}

Use USDA database values as reference. All values should be numbers (not strings).`;

      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const nutritionText = responseBody.content[0].text.trim();
      const nutritionJson = JSON.parse(nutritionText);

      return {
        per100g: {
          calories: Number(nutritionJson.calories) || 0,
          protein: Number(nutritionJson.protein) || 0,
          carbs: Number(nutritionJson.carbs) || 0,
          fat: Number(nutritionJson.fat) || 0,
          fiber: Number(nutritionJson.fiber) || 0,
        },
        dataSource: 'AI',
      };
    } catch (error) {
      console.error('AI nutrition lookup failed:', ingredientEnglish, error);
      // Return default nutrition data on error
      return {
        per100g: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
        },
        dataSource: 'AI',
      };
    }
  }

  /**
   * Full ingredient lookup with nutrition
   */
  async lookupIngredient(vietnamese: string): Promise<IngredientLookupResult> {
    const normalized = this.normalizeVietnamese(vietnamese);

    // Tier 1: Dictionary
    const dictResult = await this.lookupDictionary(normalized);
    if (dictResult) {
      return {
        vietnamese,
        english: dictResult.translation,
        nutrition: dictResult.nutrition,
        source: 'dictionary',
      };
    }

    // Tier 2: Translation Cache
    const cacheResult = await this.lookupTranslationCache(normalized);
    if (cacheResult) {
      return {
        vietnamese,
        english: cacheResult.translation,
        nutrition: cacheResult.nutrition,
        source: 'cache',
      };
    }

    // Tier 3: AI Translation + Nutrition
    const englishTranslation = await this.translateWithAI(vietnamese);
    const nutrition = await this.getNutritionWithAI(englishTranslation);

    const translation: Translation = {
      specific: englishTranslation,
      general: englishTranslation,
      category: 'ingredient',
    };

    // Save to Translation Cache
    await this.saveToTranslationCache(normalized, vietnamese, translation, nutrition);

    return {
      vietnamese,
      english: translation,
      nutrition,
      source: 'ai',
    };
  }

  /**
   * Save to Translation Cache
   * TTL: 1 year
   * GSI5: For English lookup by ai-worker
   */
  private async saveToTranslationCache(
    normalized: string,
    vietnamese: string,
    translation: Translation,
    nutrition: NutritionData
  ): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
    // English normalized for GSI5 lookup
    const englishNormalized = translation.specific.toLowerCase().replace(/\s+/g, '-');

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
          source: vietnamese,
          sourceNormalized: normalized,
          target: translation,
          nutrition,
          usageCount: 1,
          ttl,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // GSI5 for English lookup (ai-worker uses this)
          GSI5PK: englishNormalized,
          GSI5SK: 'TRANSLATION_CACHE',
        },
      })
    );
  }

  /**
   * Increment translation usage count
   */
  private async incrementTranslationUsage(normalized: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: 'TRANSLATION_CACHE',
          SK: `INGREDIENT#${normalized}`,
        },
        UpdateExpression: 'ADD usageCount :inc SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': Date.now(),
        },
      })
    );
  }
}
