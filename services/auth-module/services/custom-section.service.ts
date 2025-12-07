/**
 * Custom Section Service - Business logic for custom profile sections
 *
 * @module services/custom-section
 * @see .kiro/specs/project-restructure/user-profile-design.md - Custom Sections
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  CustomSection,
  CustomField,
  CreateSectionRequest,
  UpdateSectionRequest,
  CreateFieldRequest,
  UpdateFieldRequest,
  CustomSectionWithFields,
} from '../models/custom-section.model';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

// Limits
const MAX_SECTIONS = 5;
const MAX_FIELDS_PER_SECTION = 10;
const MAX_TOTAL_FIELDS = 30;

/**
 * Get all custom sections with fields for a user
 */
export async function getCustomSections(userId: string): Promise<CustomSectionWithFields[]> {
  // Query all CUSTOM_SECTION# and CUSTOM_FIELD# items
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':prefix': 'CUSTOM_',
    },
  });

  const response = await docClient.send(command);
  const items = response.Items || [];

  // Separate sections and fields
  const sectionsMap = new Map<string, CustomSectionWithFields>();
  const fields: CustomField[] = [];

  for (const item of items) {
    if (item.SK.startsWith('CUSTOM_SECTION#')) {
      const section: CustomSectionWithFields = {
        sectionId: item.sectionId,
        title: item.title,
        description: item.description || '',
        privacy: item.privacy || 'public',
        order: item.order || 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        fields: [],
      };
      sectionsMap.set(section.sectionId, section);
    } else if (item.SK.startsWith('CUSTOM_FIELD#')) {
      fields.push({
        fieldId: item.fieldId,
        sectionId: item.sectionId,
        label: item.label,
        type: item.type,
        value: item.value,
        privacy: item.privacy || 'private',
        required: item.required || false,
        order: item.order || 0,
        options: item.options,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }
  }

  // Attach fields to sections
  for (const field of fields) {
    const section = sectionsMap.get(field.sectionId);
    if (section) {
      section.fields.push(field);
    }
  }

  // Sort sections and fields by order
  const sections = Array.from(sectionsMap.values());
  sections.sort((a, b) => a.order - b.order);
  for (const section of sections) {
    section.fields.sort((a, b) => a.order - b.order);
  }

  return sections;
}

/**
 * Create a new custom section
 */
export async function createSection(
  userId: string,
  request: CreateSectionRequest
): Promise<CustomSection> {
  // Check section limit
  const existing = await getCustomSections(userId);
  if (existing.length >= MAX_SECTIONS) {
    throw new Error(`Maximum ${MAX_SECTIONS} sections allowed`);
  }

  const now = Date.now();
  const sectionId = uuidv4();
  const order = existing.length;

  const section: CustomSection = {
    sectionId,
    title: request.title.trim(),
    description: request.description || '',
    privacy: request.privacy || 'public',
    order,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CUSTOM_SECTION#${sectionId}`,
        entityType: 'CUSTOM_SECTION',
        ...section,
      },
    })
  );

  return section;
}

/**
 * Update a custom section
 */
export async function updateSection(
  userId: string,
  sectionId: string,
  request: UpdateSectionRequest
): Promise<CustomSection> {
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionValues: Record<string, any> = { ':updatedAt': Date.now() };

  if (request.title !== undefined) {
    updateExpressions.push('#title = :title');
    expressionNames['#title'] = 'title';
    expressionValues[':title'] = request.title.trim();
  }

  if (request.order !== undefined) {
    updateExpressions.push('#order = :order');
    expressionNames['#order'] = 'order';
    expressionValues[':order'] = request.order;
  }

  if (request.description !== undefined) {
    updateExpressions.push('#description = :description');
    expressionNames['#description'] = 'description';
    expressionValues[':description'] = request.description;
  }

  if (request.privacy !== undefined) {
    updateExpressions.push('#privacy = :privacy');
    expressionNames['#privacy'] = 'privacy';
    expressionValues[':privacy'] = request.privacy;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `CUSTOM_SECTION#${sectionId}`,
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);
  if (!response.Attributes) {
    throw new Error('Section not found');
  }

  return {
    sectionId: response.Attributes.sectionId,
    title: response.Attributes.title,
    description: response.Attributes.description || '',
    privacy: response.Attributes.privacy || 'public',
    order: response.Attributes.order,
    createdAt: response.Attributes.createdAt,
    updatedAt: response.Attributes.updatedAt,
  };
}

/**
 * Delete a custom section and all its fields
 */
export async function deleteSection(userId: string, sectionId: string): Promise<void> {
  // Get all fields in this section
  const sections = await getCustomSections(userId);
  const section = sections.find((s) => s.sectionId === sectionId);

  if (!section) {
    throw new Error('Section not found');
  }

  // Delete all fields first
  for (const field of section.fields) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `CUSTOM_FIELD#${sectionId}#${field.fieldId}`,
        },
      })
    );
  }

  // Delete section
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CUSTOM_SECTION#${sectionId}`,
      },
    })
  );
}

/**
 * Add a field to a section
 */
export async function addField(
  userId: string,
  sectionId: string,
  request: CreateFieldRequest
): Promise<CustomField> {
  // Check limits
  const sections = await getCustomSections(userId);
  const section = sections.find((s) => s.sectionId === sectionId);

  if (!section) {
    throw new Error('Section not found');
  }

  if (section.fields.length >= MAX_FIELDS_PER_SECTION) {
    throw new Error(`Maximum ${MAX_FIELDS_PER_SECTION} fields per section allowed`);
  }

  const totalFields = sections.reduce((sum, s) => sum + s.fields.length, 0);
  if (totalFields >= MAX_TOTAL_FIELDS) {
    throw new Error(`Maximum ${MAX_TOTAL_FIELDS} total fields allowed`);
  }

  const now = Date.now();
  const fieldId = uuidv4();
  const order = section.fields.length;

  const field: CustomField = {
    fieldId,
    sectionId,
    label: (request.label || 'Field').trim(),
    type: request.type || 'text',
    value: request.value ?? null,
    privacy: request.privacy || 'public',
    required: request.required || false,
    order: request.order ?? order,
    options: request.options,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CUSTOM_FIELD#${sectionId}#${fieldId}`,
        entityType: 'CUSTOM_FIELD',
        ...field,
      },
    })
  );

  return field;
}

/**
 * Update a field
 */
export async function updateField(
  userId: string,
  sectionId: string,
  fieldId: string,
  request: UpdateFieldRequest
): Promise<CustomField> {
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionValues: Record<string, any> = { ':updatedAt': Date.now() };

  if (request.label !== undefined) {
    updateExpressions.push('#label = :label');
    expressionNames['#label'] = 'label';
    expressionValues[':label'] = request.label.trim();
  }

  if (request.type !== undefined) {
    updateExpressions.push('#type = :type');
    expressionNames['#type'] = 'type';
    expressionValues[':type'] = request.type;
  }

  if (request.value !== undefined) {
    updateExpressions.push('#value = :value');
    expressionNames['#value'] = 'value';
    expressionValues[':value'] = request.value;
  }

  if (request.privacy !== undefined) {
    updateExpressions.push('#privacy = :privacy');
    expressionNames['#privacy'] = 'privacy';
    expressionValues[':privacy'] = request.privacy;
  }

  if (request.required !== undefined) {
    updateExpressions.push('#required = :required');
    expressionNames['#required'] = 'required';
    expressionValues[':required'] = request.required;
  }

  if (request.order !== undefined) {
    updateExpressions.push('#order = :order');
    expressionNames['#order'] = 'order';
    expressionValues[':order'] = request.order;
  }

  if (request.options !== undefined) {
    updateExpressions.push('#options = :options');
    expressionNames['#options'] = 'options';
    expressionValues[':options'] = request.options;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `CUSTOM_FIELD#${sectionId}#${fieldId}`,
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);
  if (!response.Attributes) {
    throw new Error('Field not found');
  }

  return {
    fieldId: response.Attributes.fieldId,
    sectionId: response.Attributes.sectionId,
    label: response.Attributes.label,
    type: response.Attributes.type,
    value: response.Attributes.value,
    privacy: response.Attributes.privacy,
    required: response.Attributes.required,
    order: response.Attributes.order,
    options: response.Attributes.options,
    createdAt: response.Attributes.createdAt,
    updatedAt: response.Attributes.updatedAt,
  };
}

/**
 * Delete a field
 */
export async function deleteField(
  userId: string,
  sectionId: string,
  fieldId: string
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CUSTOM_FIELD#${sectionId}#${fieldId}`,
      },
    })
  );
}
