/**
 * Mocked email service.
 * In a production build this would call SendGrid / SES / etc.
 * For the QA course environment all messages are logged to stdout only —
 * no real emails are ever sent.
 */

/**
 * Sends (mocks) an email verification link to the user.
 *
 * @param email - Recipient email address.
 * @param token - The email-verification token to embed in the link.
 */
export function sendVerificationEmail(email: string, token: string): void {
  const link = `http://localhost:5173/verify-email?token=${token}`;
  console.log('\n========== [MOCK EMAIL: Verify Email] ==========');
  console.log(`TO:      ${email}`);
  console.log(`SUBJECT: Confirm your Helix Health Portal account`);
  console.log(`LINK:    ${link}`);
  console.log('================================================\n');
}

/**
 * Sends (mocks) a password-reset email to the user.
 *
 * @param email - Recipient email address.
 * @param token - The signed password-reset token.
 */
export function sendPasswordResetEmail(email: string, token: string): void {
  const link = `http://localhost:5173/reset-password?token=${token}`;
  console.log('\n========== [MOCK EMAIL: Password Reset] ==========');
  console.log(`TO:      ${email}`);
  console.log(`SUBJECT: Reset your Helix Health Portal password`);
  console.log(`LINK:    ${link}`);
  console.log('==================================================\n');
}
