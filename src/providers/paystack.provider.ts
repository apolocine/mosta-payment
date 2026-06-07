// @mostajs/payment — Paystack provider (Afrique : Nigeria, Ghana, Afrique du Sud, Kenya)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://paystack.com/docs/api/ · webhook HMAC-SHA512(body, secretKey)

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'
import { createHmac } from 'node:crypto'

export interface PaystackConfig {
  secretKey: string
  baseUrl?: string
}

export class PaystackProvider extends AbstractPaymentProvider {
  readonly name = 'paystack'
  readonly supportedCurrencies = ['NGN', 'GHS', 'ZAR', 'KES']
  readonly supportedMethods = ['card', 'bank', 'ussd', 'mobile_money']

  private baseUrl: string

  constructor(private config: PaystackConfig) {
    super()
    this.baseUrl = config.baseUrl ?? 'https://api.paystack.co'
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.config.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.metadata?.email ?? `${params.orderId}@example.com`,
        amount: Math.round(params.amount * 100),        // subunits (kobo/pesewa/cents)
        currency: (params.currency ?? 'NGN').toUpperCase(),
        reference: params.orderId,                        // = notre orderId (matching)
        callback_url: params.successUrl,
        metadata: params.metadata,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[paystack] Checkout failed: ${err.message ?? res.statusText}`)
    }
    const json = await res.json()
    const d = json.data ?? {}
    return { url: d.authorization_url ?? null, sessionId: String(d.reference ?? d.access_code ?? params.orderId) }
  }

  /** Mappe un event Paystack → type normalisé. */
  static mapEvent(type: string | undefined): string {
    switch (String(type)) {
      case 'charge.success': return 'payment.success'
      case 'refund.processed': return 'payment.refunded'
      case 'charge.failed': return 'payment.failed'
      default: return 'payment.pending'
    }
  }

  protected async doVerifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    const computed = createHmac('sha512', this.config.secretKey).update(body).digest('hex')
    if (computed !== signature) throw new Error('[paystack] Invalid webhook signature')
    const raw = JSON.parse(body)
    const d = raw.data ?? {}
    return {
      type: PaystackProvider.mapEvent(raw.event),
      data: {
        orderId: d.reference,                  // = notre orderId
        amount: d.amount !== undefined ? Number(d.amount) / 100 : undefined,
        currency: d.currency,
        status: d.status ?? raw.event,
      },
      raw,
    }
  }
}

/**
 * Crée un provider Paystack depuis l'env (cascade @mostajs/config).
 * Env : PAYSTACK_SECRET_KEY.
 */
export function createPaystackProvider(config?: Partial<PaystackConfig>): PaystackProvider {
  return new PaystackProvider({
    secretKey: config?.secretKey ?? getEnv('PAYSTACK_SECRET_KEY', ''),
    baseUrl: config?.baseUrl ?? getEnv('PAYSTACK_BASE_URL'),
  })
}
