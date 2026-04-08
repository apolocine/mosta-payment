// @mostajs/payment — Checkout API route handler
// Author: Dr Hamid MADANI drmdh@msn.com
import type { PaymentConfig, CheckoutRequest } from '../types/index.js'
import { createStripeClient, createCheckoutSession } from '../lib/stripe.js'

/**
 * Create a checkout route handler (Next.js App Router).
 * Generalized from booking-baloon /api/checkout/route.ts
 */
export function createCheckoutHandler(config: PaymentConfig) {
  return async function POST(req: Request): Promise<Response> {
    try {
      const body = await req.json() as CheckoutRequest

      if (!body.orderId || !body.lineItems?.length) {
        return Response.json(
          { error: 'orderId and lineItems are required' },
          { status: 400 },
        )
      }

      const stripe = createStripeClient(config)
      const result = await createCheckoutSession(stripe, body, config)

      return Response.json(result)
    } catch (err) {
      console.error('[payment] Checkout error:', err)
      return Response.json(
        { error: err instanceof Error ? err.message : 'Checkout failed' },
        { status: 500 },
      )
    }
  }
}
