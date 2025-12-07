import { CustomMessageTriggerEvent, CustomMessageTriggerHandler } from 'aws-lambda';

/**
 * CustomMessage Lambda Trigger
 *
 * Triggered when Cognito needs to send an email or SMS message.
 * Customizes email templates for verification and other messages.
 *
 * Supported message types:
 * - CustomMessage_SignUp: Email verification code
 * - CustomMessage_ForgotPassword: Password reset code
 * - CustomMessage_ResendCode: Resend verification code
 * - CustomMessage_UpdateUserAttribute: Verify new email/phone
 * - CustomMessage_VerifyUserAttribute: Verify attribute change
 * - CustomMessage_Authentication: MFA code (not used)
 *
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-message.html
 */
export const handler: CustomMessageTriggerHandler = async (event: CustomMessageTriggerEvent) => {
  console.log('CustomMessage trigger started', {
    triggerSource: event.triggerSource,
    username: event.userName,
  });

  const { triggerSource, request, userName } = event;
  const { userAttributes, codeParameter } = request;

  // Get username from attributes (prefer cognito:username over userName)
  const username = userAttributes['cognito:username'] || userName;
  // Email is available in userAttributes if needed for custom messages

  try {
    switch (triggerSource) {
      case 'CustomMessage_SignUp':
        // Email verification during sign up
        event.response.emailSubject = 'Verify your email - Everyone Cook';
        event.response.emailMessage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f0; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(32, 61, 17, 0.15); overflow: hidden;">
          <!-- Header with dark green (#203d11) - Clean & Professional -->
          <tr>
            <td style="background: linear-gradient(135deg, #203d11 0%, #2d5518 100%); padding: 50px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 42px; font-weight: 800; letter-spacing: -1.5px;">
                Everyone Cook
              </h1>
              <p style="margin: 12px 0 0; color: rgba(255, 255, 255, 0.85); font-size: 16px; font-weight: 400; letter-spacing: 0.5px;">Your Culinary Journey Starts Here</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 45px 40px;">
              <h2 style="margin: 0 0 24px; color: #203d11; font-size: 28px; font-weight: 700; line-height: 1.3;">
                Welcome, <span style="color: #975b1d;">${username}</span>! 👋
              </h2>

              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.7;">
                Thank you for joining <strong style="color: #203d11;">Everyone Cook</strong>! We're excited to have you in our community of food lovers and home chefs.
              </p>

              <p style="margin: 0 0 35px; color: #4a5568; font-size: 16px; line-height: 1.7;">
                To complete your registration and start exploring amazing recipes, please verify your email address with the code below:
              </p>

              <!-- Verification Code Box with brown-gold border -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 35px;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #f7f3ed 0%, #faf8f3 100%); border: 3px solid #975b1d; border-radius: 12px; padding: 40px 30px; box-shadow: 0 8px 16px rgba(151, 91, 29, 0.15);">
                    <p style="margin: 0 0 12px; color: #975b1d; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">
                      Your Verification Code
                    </p>
                    <p style="margin: 0; color: #203d11; font-size: 52px; font-weight: 800; letter-spacing: 10px; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                      ${codeParameter}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef5e7; border-left: 5px solid #975b1d; border-radius: 8px; padding: 18px 20px; margin: 0 0 35px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #975b1d; font-size: 14px; line-height: 1.6; font-weight: 500;">
                      ⏱️ <strong>Important:</strong> This code will expire in 24 hours for security reasons.
                    </p>
                  </td>
                </tr>
              </table>

              <div style="background: linear-gradient(to right, #203d11 0%, #2d5518 100%); border-radius: 12px; padding: 30px; margin: 0 0 20px;">
                <p style="margin: 0 0 18px; color: #ffffff; font-size: 16px; font-weight: 700;">
                  ✨ What You'll Get:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: rgba(255, 255, 255, 0.9); font-size: 15px; line-height: 2;">
                  <li><strong style="color: #975b1d;">Discover</strong> thousands of delicious recipes</li>
                  <li><strong style="color: #975b1d;">Share</strong> your own culinary creations</li>
                  <li><strong style="color: #975b1d;">Connect</strong> with fellow food enthusiasts</li>
                  <li><strong style="color: #975b1d;">AI-Powered</strong> cooking assistance</li>
                </ul>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; border-radius: 8px; padding: 18px 20px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      🔒 <strong style="color: #111827;">Security Notice:</strong> If you didn't create an account with Everyone Cook, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #203d11; padding: 35px 40px; text-align: center;">
              <p style="margin: 0 0 12px; color: #975b1d; font-size: 16px; font-weight: 700;">
                Happy Cooking! 🎉
              </p>
              <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.8); font-size: 14px; font-weight: 500;">
                The Everyone Cook Team
              </p>
              <p style="margin: 0; color: rgba(255, 255, 255, 0.6); font-size: 12px;">
                © ${new Date().getFullYear()} Everyone Cook. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
        break;

      case 'CustomMessage_ForgotPassword':
        // Password reset code
        event.response.emailSubject = '🔐 Reset your password - Everyone Cook';
        event.response.emailMessage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">
                🔐 Password Reset
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">
                Hello, ${username}
              </h2>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                We received a request to reset your Everyone Cook password. Use the verification code below to proceed:
              </p>

              <!-- Reset Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 8px; padding: 30px;">
                    <p style="margin: 0 0 10px; color: #fee2e2; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                      Password Reset Code
                    </p>
                    <p style="margin: 0; color: #ffffff; font-size: 48px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                      ${codeParameter}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px; margin: 0 0 30px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                      ⚠️ <strong>Security Notice:</strong> This code will expire in 1 hour. If you didn't request this reset, please ignore this email and your password will remain unchanged.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 16px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; color: #1e40af; font-size: 14px; font-weight: 600;">
                      💡 Security Tips:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 13px; line-height: 1.6;">
                      <li>Use a strong, unique password</li>
                      <li>Never share your password with anyone</li>
                      <li>Enable two-factor authentication if available</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
                The Everyone Cook Team
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} Everyone Cook. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
        break;

      case 'CustomMessage_ResendCode':
        // Resend verification code
        event.response.emailSubject = '🔑 Your verification code - Everyone Cook';
        event.response.emailMessage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">
                🔑 New Verification Code
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">
                Hello, ${username}
              </h2>

              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                You requested a new verification code. Here it is:
              </p>

              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 30px;">
                    <p style="margin: 0 0 10px; color: #d1fae5; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                      Verification Code
                    </p>
                    <p style="margin: 0; color: #ffffff; font-size: 48px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                      ${codeParameter}
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                      ⏱️ This code will expire in 24 hours.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
                The Everyone Cook Team
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} Everyone Cook. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
        break;

      case 'CustomMessage_UpdateUserAttribute':
      case 'CustomMessage_VerifyUserAttribute':
        // Verify email/phone change
        event.response.emailSubject = 'Verify your new email address';
        event.response.emailMessage = `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #4F46E5;">Verify Email Change</h2>
                <p>Hello <strong>${username}</strong>,</p>
                <p>You recently requested to change your email address. Please verify your new email using the code below:</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <h1 style="margin: 0; color: #4F46E5; letter-spacing: 4px;">${codeParameter}</h1>
                </div>
                <p>This code will expire in 24 hours.</p>
                <p>If you didn't request this change, please contact support immediately.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="color: #6b7280; font-size: 14px;">
                  Best regards,<br>
                  Everyone Cook Team
                </p>
              </div>
            </body>
          </html>
        `;
        break;

      default:
        // Keep default message for other trigger sources
        console.log('Using default message template', { triggerSource });
        break;
    }

    console.log('CustomMessage trigger completed', {
      triggerSource,
      username,
      emailSubject: event.response.emailSubject,
    });

    return event;
  } catch (error) {
    console.error('CustomMessage trigger failed', {
      triggerSource,
      username: userName,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return event with default message - don't block email sending
    return event;
  }
};
