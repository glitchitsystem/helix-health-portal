/**
 * Mocked Stripe payment service.
 *
 * Rules:
 *  - Payments of $10,000 or less always succeed.
 *  - Payments over $10,000 always fail (simulates a hard limit).
 *
 * In production this module would call the real Stripe SDK.
 */

const STRIPE_MAX_AUTO_SUCCEED = 10_000;

export interface PaymentIntentResult {
  success: boolean;
  payment_intent_id: string;
  error?: string;
}

/**
 * Creates a mocked Stripe payment intent.
 *
 * @param amountDollars - The payment amount in USD dollars.
 * @param metadata      - Arbitrary key-value metadata (e.g. invoice_id).
 * @returns             A mocked PaymentIntentResult.
 */
export function createPaymentIntent(
  amountDollars: number,
  metadata: Record<string, string> = {},
): PaymentIntentResult {
  const intentId = `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  if (amountDollars > STRIPE_MAX_AUTO_SUCCEED) {
    console.log(
      `[STRIPE] Payment failed: amount $${amountDollars} exceeds limit $${STRIPE_MAX_AUTO_SUCCEED}.`,
      { intentId, metadata },
    );
    return {
      success: false,
      payment_intent_id: intentId,
      error: `Payment declined: amount exceeds maximum of $${STRIPE_MAX_AUTO_SUCCEED}`,
    };
  }

  console.log(
    `[STRIPE] Payment succeeded: $${amountDollars}`,
    { intentId, metadata },
  );
  return { success: true, payment_intent_id: intentId };
}
