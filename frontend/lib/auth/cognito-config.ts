/**
 * AWS Cognito Configuration
 * Centralized configuration for AWS Amplify Auth
 */

import { Amplify } from 'aws-amplify';

let isConfigured = false;

export const configureCognito = () => {
  if (isConfigured) return;

  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const isDev = process.env.NODE_ENV === 'development';

  if (!userPoolId || !userPoolClientId) {
    if (isDev) {
      console.error('[Cognito Config] Missing required environment variables!');
    }
    return;
  }

  try {
    Amplify.configure(
      {
        Auth: {
          Cognito: {
            userPoolId,
            userPoolClientId,
            signUpVerificationMethod: 'code',
            loginWith: {
              username: true,
              email: true,
            },
          },
        },
      },
      { ssr: true }
    );

    isConfigured = true;
  } catch (error) {
    console.error('Failed to configure Cognito:', error);
  }
};

export const cognitoConfig = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
  region: process.env.NEXT_PUBLIC_COGNITO_REGION!,
};

