import { createPaymentIntent } from '../../server/src/services/stripeService';

describe('createPaymentIntent', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('createPaymentIntent succeeds for an amount at the auto-succeed limit', () => {
    // Arrange
    const amount = 10_000;

    // Act
    const result = createPaymentIntent(amount);

    // Assert
    expect(result.success).toBe(true);
    expect(result.payment_intent_id).toMatch(/^pi_test_/);
    expect(result.error).toBeUndefined();
  });

  it('createPaymentIntent succeeds for an amount below the auto-succeed limit', () => {
    // Arrange
    const amount = 250;

    // Act
    const result = createPaymentIntent(amount, { invoice_id: 'inv_1' });

    // Assert
    expect(result.success).toBe(true);
    expect(result.payment_intent_id).toMatch(/^pi_test_/);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Payment succeeded'),
      expect.objectContaining({ metadata: { invoice_id: 'inv_1' } }),
    );
  });

  it('createPaymentIntent fails for an amount over the auto-succeed limit', () => {
    // Arrange
    const amount = 10_000.01;

    // Act
    const result = createPaymentIntent(amount, { invoice_id: 'inv_2' });

    // Assert
    expect(result.success).toBe(false);
    expect(result.payment_intent_id).toMatch(/^pi_test_/);
    expect(result.error).toContain('exceeds maximum');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Payment failed'),
      expect.objectContaining({ metadata: { invoice_id: 'inv_2' } }),
    );
  });

  it('createPaymentIntent generates unique payment intent ids across calls', () => {
    // Act
    const first = createPaymentIntent(100);
    const second = createPaymentIntent(100);

    // Assert
    expect(first.payment_intent_id).not.toBe(second.payment_intent_id);
  });
});
