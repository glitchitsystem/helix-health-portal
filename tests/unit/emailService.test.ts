import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../../server/src/services/emailService';

describe('emailService', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('sendVerificationEmail', () => {
    it('sendVerificationEmail logs the recipient and verification link', () => {
      // Act
      sendVerificationEmail('patient@example.com', 'verify-token-123');

      // Assert
      const output = consoleSpy.mock.calls.flat().join('\n');
      expect(output).toContain('patient@example.com');
      expect(output).toContain(
        'http://localhost:5173/verify-email?token=verify-token-123',
      );
      expect(output).toContain('Verify Email');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sendPasswordResetEmail logs the recipient and reset link', () => {
      // Act
      sendPasswordResetEmail('patient@example.com', 'reset-token-456');

      // Assert
      const output = consoleSpy.mock.calls.flat().join('\n');
      expect(output).toContain('patient@example.com');
      expect(output).toContain(
        'http://localhost:5173/reset-password?token=reset-token-456',
      );
      expect(output).toContain('Password Reset');
    });
  });
});
