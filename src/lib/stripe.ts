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
  const currency = (request.currency ?? config.defaultCurrency ?? config.currency ?? 'usd').toLowerCase()

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

/**
 * Create a Stripe Billing (subscription) session.
 */
export async function createBillingSession(
  stripe: Stripe,
  request: { customerId: string; priceId: string; successUrl: string; cancelUrl: string; trialDays?: number; metadata?: Record<string, string> },
): Promise<{ url: string | null; sessionId: string }> {
  const params: any = {
    customer: request.customerId,
    mode: 'subscription',
    line_items: [{ price: request.priceId, quantity: 1 }],
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    metadata: request.metadata,
  }
  if (request.trialDays) {
    params.subscription_data = { trial_period_days: request.trialDays }
  }
  const session = await stripe.checkout.sessions.create(params)
  return { url: session.url, sessionId: session.id }
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(
  stripe: Stripe,
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
  return { url: session.url }
}

/**
 * Webhook handler callbacks for Stripe billing events.
 */
export interface WebhookHandlers {
  onCheckoutCompleted?: (session: any) => Promise<void>
  onInvoicePaid?: (invoice: any) => Promise<void>
  onSubscriptionUpdated?: (subscription: any) => Promise<void>
  onSubscriptionDeleted?: (subscription: any) => Promise<void>
  onPaymentFailed?: (invoice: any) => Promise<void>
}

/**
 * Handle Stripe billing webhooks with event-type dispatch.
 */
export async function handleBillingWebhook(
  stripe: Stripe,
  body: string | Buffer,
  signature: string,
  secret: string,
  handlers: WebhookHandlers,
): Promise<{ received: boolean; type: string }> {
  const event = stripe.webhooks.constructEvent(body, signature, secret)

  switch (event.type) {
    case 'checkout.session.completed':
      await handlers.onCheckoutCompleted?.(event.data.object)
      break
    case 'invoice.paid':
      await handlers.onInvoicePaid?.(event.data.object)
      break
    case 'customer.subscription.updated':
      await handlers.onSubscriptionUpdated?.(event.data.object)
      break
    case 'customer.subscription.deleted':
      await handlers.onSubscriptionDeleted?.(event.data.object)
      break
    case 'invoice.payment_failed':
      await handlers.onPaymentFailed?.(event.data.object)
      break
  }

  return { received: true, type: event.type }
}
