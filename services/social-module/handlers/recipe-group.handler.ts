/**
 * API Handlers for Recipe Groups
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RecipeGroupService } from '../services/recipe-group.service';
import { getUsername } from '../shared/cognito.utils';

const recipeGroupService = new RecipeGroupService();

// Simple response helpers
const createResponse = (statusCode: number, body: object) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

/**
 * Create a new recipe group
 * Route: POST /users/{username}/recipe-groups
 */
export const createRecipeGroup = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const authUsername = getUsername(event);
    const username = event.pathParameters?.username;

    if (!username) {
      return createResponse(400, { message: 'Username is missing from path.' });
    }

    // Authorization check - users can only create groups for themselves
    if (authUsername !== username.toLowerCase()) {
      return createResponse(403, {
        message: 'Forbidden: You can only create groups for yourself.',
      });
    }

    if (!event.body) {
      return createResponse(400, { message: 'Request body is missing.' });
    }

    const { name, description } = JSON.parse(event.body);

    if (!name) {
      return createResponse(400, { message: 'Group name is required.' });
    }

    const newGroup = await recipeGroupService.createRecipeGroup(username, name, description);

    return createResponse(201, newGroup);
  } catch (error: any) {
    console.error('Error creating recipe group:', error);
    return createResponse(500, { message: 'Internal server error', error: error.message });
  }
};

/**
 * Get all recipe groups for a user
 * Route: GET /users/{username}/recipe-groups
 */
export const getMyRecipeGroups = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const authUsername = getUsername(event);
    const username = event.pathParameters?.username;

    if (!username) {
      return createResponse(400, { message: 'Username is missing from path.' });
    }

    // For now, only allow users to see their own groups
    if (authUsername !== username.toLowerCase()) {
      return createResponse(403, { message: 'Forbidden: You can only view your own groups.' });
    }

    const groups = await recipeGroupService.getRecipeGroupsForUser(username);

    return createResponse(200, { groups });
  } catch (error: any) {
    console.error('Error getting recipe groups:', error);
    return createResponse(500, { message: 'Internal server error', error: error.message });
  }
};

/**
 * Add a recipe to a group
 * Route: POST /users/{username}/recipe-groups/{groupId}/recipes
 */
export const addRecipeToGroup = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const authUsername = getUsername(event);
    const username = event.pathParameters?.username;
    const groupId = event.pathParameters?.groupId;

    if (!username || !groupId) {
      return createResponse(400, { message: 'Username and Group ID are missing from path.' });
    }

    // Authorization check
    if (authUsername !== username.toLowerCase()) {
      return createResponse(403, { message: 'Forbidden: You can only modify your own groups.' });
    }

    if (!event.body) {
      return createResponse(400, { message: 'Request body is missing.' });
    }

    const { recipeId, recipeTitle } = JSON.parse(event.body);

    if (!recipeId || !recipeTitle) {
      return createResponse(400, { message: 'recipeId and recipeTitle are required.' });
    }

    const newItem = await recipeGroupService.addRecipeToGroup(
      username,
      groupId,
      recipeId,
      recipeTitle
    );

    return createResponse(201, newItem);
  } catch (error: any) {
    console.error('Error adding recipe to group:', error);
    // Check for specific error from service
    if (error.message.includes('User does not own this group')) {
      return createResponse(403, { message: 'Forbidden: You do not own this group.' });
    }
    return createResponse(500, { message: 'Internal server error', error: error.message });
  }
};
