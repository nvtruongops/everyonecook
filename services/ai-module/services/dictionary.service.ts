/**
 * Dictionary Service
 *
 * Business logic for managing dictionary entries (VI-EN translations)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// In a real app, this would be more detailed
interface DictionaryEntry {
  vietnamese: string;
  english: string;
}

export class DictionaryService {
  /**
   * Adds a new entry to the dictionary, checking for duplicates using GSI5.
   */
  async addDictionaryEntry(entry: DictionaryEntry): Promise<any> {
    // Normalize names
    const normalizedVietnamese = this.normalize(entry.vietnamese);
    const normalizedEnglish = this.normalize(entry.english);

    // 1. Check for duplicate English entry using GSI5
    const gsi5Query = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI5',
      KeyConditionExpression: 'GSI5PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `ENGLISH_NAME#${normalizedEnglish}`,
      },
    });

    const gsi5Result = await docClient.send(gsi5Query);
    if (gsi5Result.Items && gsi5Result.Items.length > 0) {
      throw new Error(`Duplicate entry: The English term '${entry.english}' already exists.`);
    }

    // 2. Prepare the new item
    const newItem = {
      PK: `DICTIONARY`,
      SK: `INGREDIENT#${normalizedVietnamese}`,
      source: entry.vietnamese,
      target: {
        specific: normalizedEnglish,
        // other fields can be added
      },
      // GSI5 keys for duplicate checking
      GSI5PK: `ENGLISH_NAME#${normalizedEnglish}`,
      GSI5SK: `DICTIONARY`,
      addedBy: 'admin', // Or the user ID
      createdAt: new Date().toISOString(),
    };

    // 3. Add the new item
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    try {
      await docClient.send(putCommand);
      return newItem;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new Error(
          `Duplicate entry: The Vietnamese term '${entry.vietnamese}' already exists.`
        );
      }
      throw error;
    }
  }

  private normalize(text: string): string {
    // Simple normalization for this example
    return text.toLowerCase().replace(/\s+/g, '-');
  }
}
