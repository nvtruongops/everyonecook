/**
 * Recipe Group Service
 *
 * Business logic for managing user's recipe groups (collections)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// This represents the group's metadata
export interface RecipeGroup {
  groupId: string;
  ownerUsername: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// This represents the link between a user and a group for querying
export interface UserRecipeGroupLink {
  username: string;
  groupId: string;
  groupName: string;
  createdAt: string;
}

// This represents a recipe within a group
export interface RecipeGroupItem {
  groupId: string;
  recipeId: string;
  recipeTitle: string; // Denormalized
  addedAt: string;
}

/**
 * Recipe Group Service Class
 */
export class RecipeGroupService {
  /**
   * Create a new recipe group for a user
   */
  async createRecipeGroup(
    username: string,
    name: string,
    description?: string
  ): Promise<RecipeGroup> {
    const now = new Date().toISOString();
    const groupId = ulid();

    const group: RecipeGroup = {
      groupId,
      ownerUsername: username,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    };

    // Item 1: The group's metadata
    const groupMetadataItem = {
      PK: `GROUP#${groupId}`,
      SK: `METADATA`,
      ...group,
    };

    // Item 2: The link for the user to find the group (for GSI3)
    const userGroupLinkItem = {
      PK: `USER#${username}`,
      SK: `GROUP#${groupId}`,
      GSI3PK: `USER#${username}#GROUPS`,
      GSI3SK: `GROUP#${groupId}`,
      groupId: groupId,
      groupName: name, // Denormalized name for easier listing
      createdAt: now,
    };

    const transactCommand = new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: groupMetadataItem,
            ConditionExpression: 'attribute_not_exists(PK)', // Ensure group doesn't already exist
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: userGroupLinkItem,
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    });

    try {
      await docClient.send(transactCommand);
      return group;
    } catch (error: any) {
      console.error('Failed to create recipe group transaction:', error);
      // Handle potential transaction errors, e.g., ConditionalCheckFailedException
      if (error.name === 'TransactionCanceledException') {
        throw new Error('A group with the same ID already exists or a race condition occurred.');
      }
      throw new Error('Failed to create recipe group.');
    }
  }

  /**
   * Get all recipe groups for a user using GSI3
   */
  async getRecipeGroupsForUser(username: string): Promise<UserRecipeGroupLink[]> {
    const queryCommand = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI3',
      KeyConditionExpression: 'GSI3PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${username}#GROUPS`,
      },
      // Sort by group name for consistent ordering, GSI3SK is GROUP#{groupId} which is sorted by ULID
      ScanIndexForward: true,
    });

    try {
      const result = await docClient.send(queryCommand);
      // The items returned are the UserGroupLink items.
      // The consumer of this service can use the groupId from these items to fetch full group details if needed.
      return (result.Items || []) as UserRecipeGroupLink[];
    } catch (error) {
      console.error('Failed to get recipe groups for user:', error);
      throw new Error('Could not retrieve recipe groups.');
    }
  }

  /**
   * Add a recipe to a specific group
   */
  async addRecipeToGroup(
    username: string,
    groupId: string,
    recipeId: string,
    recipeTitle: string
  ): Promise<RecipeGroupItem> {
    // 1. Verify user owns the group
    const ownershipCheck = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${username}`,
          SK: `GROUP#${groupId}`,
        },
      })
    );

    if (!ownershipCheck.Item) {
      throw new Error('User does not own this group or group does not exist.');
    }

    // 2. Create the recipe item within the group
    const now = new Date().toISOString();
    const recipeItem: RecipeGroupItem = {
      groupId,
      recipeId,
      recipeTitle, // Denormalized for easier access
      addedAt: now,
    };

    const dynamoDbItem = {
      PK: `GROUP#${groupId}`,
      SK: `RECIPE#${recipeId}`,
      ...recipeItem,
    };

    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: dynamoDbItem,
    });

    try {
      await docClient.send(putCommand);
      return recipeItem;
    } catch (error) {
      console.error('Failed to add recipe to group:', error);
      throw new Error('Could not add recipe to the group.');
    }
  }
}
