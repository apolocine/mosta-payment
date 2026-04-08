// @mostajs/payment — Stripe SDK wrapper
// Author: Dr Hamid MADANI drmdh@msn.com
import Stripe from 'stripe'
import type { CheckoutRequest, CheckoutResult, PaymentConfig } from '../types/index.js'

/**
 * Create a Stripe client instance.
 */
export function createStripeClient(config: PaymentConfig): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error('[payment] stripeSecretKey is required')
  }
  return new Stripe(config.stripeSecretKey)
}

/**
 * Create a Stripe Checkout session.
 * Generalized from booking-baloon /api/checkout — works with any line items.
 */
export async function createCheckoutSession(
  stripe: Stripe,
  request: CheckoutRequest,
  config: PaymentConfig,
): Promise<CheckoutResult> {
  const currency = (request.currency ?? config.currency ?? 'usd').toLowerCase()

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: request.lineItems.map(item => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
        },
        unit_amount: Math.round(item.unitAmount * 100), // convert to cents
      },
      quantity: item.quantity,
    })),
    mode: 'payment',
    success_url: config.successUrlTemplate.replace('{orderId}', request.orderId),
    cancel_url: config.cancelUrlTemplate.replace('{orderId}', request.orderId),
    metadata: {
      orderId: request.orderId,
      ...request.metadata,
    },
  })

  return { url: session.url, sessionId: session.id }
}

/**
 * Construct and verify a Stripe webhook event.
 */
export async function handleWebhook(
  stripe: Stripe,
  body: string | Buffer,
  signature: string,
  secret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEvent(body, signature, secret)
}
