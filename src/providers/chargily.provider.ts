// @mostajs/payment — Chargily Pay V2 provider (CIB + EDAHABIA — Algerie)
// Author: Dr Hamid MADANI drmdh@msn.com
// Ref: https://dev.chargily.com/pay-v2/api-reference/
// GitHub: https://github.com/chargily

import type { PaymentProvider, CheckoutParams, CheckoutResult, CustomerParams, WebhookEvent } from '../core/provider.interface.js'
import { getEnv } from '@mostajs/config'
import { createHmac } from 'node:crypto'

export interface ChargilyConfig {
  apiKey: string
  testMode?: boolean
  successUrl: string
  failureUrl: string
  webhookUrl?: string
}

export class ChargilyProvider implements PaymentProvider {
  readonly name = 'chargily'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib', 'edahabia']

  private baseUrl: string

  constructor(private config: ChargilyConfig) {
    this.baseUrl = config.testMode
      ? 'https://pay.chargily.net/test/api/v2'
      : 'https://pay.chargily.net/api/v2'
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: params.amount, // DZD (pas centimes — Chargily attend le montant reel)
        currency: 'dzd',
        success_url: params.successUrl ?? this.config.successUrl,
        failure_url: params.cancelUrl ?? this.config.failureUrl,
        webhook_endpoint: params.webhookUrl ?? this.config.webhookUrl,
        description: params.description ?? `Commande ${params.orderId}`,
        metadata: { orderId: params.orderId, ...params.metadata },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[chargily] Checkout failed: ${err.message ?? res.statusText}`)
    }

    const data = await res.json()
    return { url: data.checkout_url, sessionId: data.id }
  }

  async createCustomer(params: CustomerParams): Promise<string> {
    const res = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        metadata: params.metadata,
      }),
    })

    if (!res.ok) throw new Error(`[chargily] Create customer failed: ${res.statusText}`)
    const data = await res.json()
    return data.id
  }

  async getCustomer(customerId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/customers/${customerId}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`[chargily] Get customer failed: ${res.statusText}`)
    return res.json()
  }

  /**
   * Get payment details by checkout ID.
   */
  async getPayment(checkoutId: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/checkouts/${checkoutId}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`[chargily] Get payment failed: ${res.statusText}`)
    return res.json()
  }

  async verifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    // Chargily signs with HMAC-SHA256 using the API key as secret
    const computed = createHmac('sha256', this.config.apiKey).update(body).digest('hex')
    if (computed !== signature) {
      throw new Error('[chargily] Invalid webhook signature')
    }

    const data = JSON.parse(body)
    const type = data.status === 'paid' ? 'payment.success'
      : data.status === 'failed' ? 'payment.failed'
      : data.status === 'canceled' ? 'payment.canceled'
      : 'payment.pending'

    return {
      type,
      data: {
        checkoutId: data.id,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        metadata: data.metadata,
        orderId: data.metadata?.orderId,
      },
      raw: data,
    }
  }
}

/**
 * Create a Chargily provider from environment variables.
 */
export function createChargilyProvider(config?: Partial<ChargilyConfig>): ChargilyProvider {
  return new ChargilyProvider({
    apiKey: config?.apiKey ?? getEnv('CHARGILY_API_KEY', ''),
    testMode: config?.testMode ?? getEnv('CHARGILY_TEST_MODE') !== 'false',
    successUrl: config?.successUrl ?? getEnv('CHARGILY_SUCCESS_URL', '/payment/success'),
    failureUrl: config?.failureUrl ?? getEnv('CHARGILY_FAILURE_URL', '/payment/failed'),
    webhookUrl: config?.webhookUrl ?? getEnv('CHARGILY_WEBHOOK_URL'),
  })
}
