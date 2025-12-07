/**
 * AWS Cognito Configuration
 * Centralized configuration for AWS Amplify Auth
 */

import { Amplify } from 'aws-amplify';

let isConfigured = false;

export const configureCognito = () => {
  if (isConfigured) return;

  try {
    Amplify.configure(
      {
        Auth: {
          Cognito: {
            userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
            userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
            signUpVerificationMethod: 'code',
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

