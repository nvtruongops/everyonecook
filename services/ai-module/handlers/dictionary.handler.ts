import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DictionaryService } from '../services/dictionary.service';

const dictionaryService = new DictionaryService();

const createResponse = (statusCode: number, body: object) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Add a new dictionary entry
 * Route: POST /dictionary
 */
export const addDictionaryEntry = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const authUserId = event.requestContext.authorizer?.claims.sub;
    if (!authUserId) {
      // Assuming this is an admin-only action for now
      return createResponse(401, { message: 'Unauthorized' });
    }

    if (!event.body) {
      return createResponse(400, { message: 'Request body is missing.' });
    }

    const { vietnamese, english } = JSON.parse(event.body);

    if (!vietnamese || !english) {
      return createResponse(400, {
        message: 'Both "vietnamese" and "english" terms are required.',
      });
    }

    const newEntry = await dictionaryService.addDictionaryEntry({ vietnamese, english });

    return createResponse(201, newEntry);
  } catch (error) {
    console.error('Error adding dictionary entry:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Duplicate entry')) {
      return createResponse(409, { message: errorMessage }); // 409 Conflict
    }
    return createResponse(500, { message: 'Internal server error', error: errorMessage });
  }
};
