// @mostajs/payment — Chargily Pay V2 provider (CIB + EDAHABIA — Algerie)
// Author: Dr Hamid MADANI drmdh@msn.com
// Ref: https://dev.chargily.com/pay-v2/api-reference/
// GitHub: https://github.com/chargily

import type { CheckoutParams, CheckoutResult, CustomerParams, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'
import { createHmac } from 'node:crypto'

export interface ChargilyConfig {
  apiKey: string
  testMode?: boolean
  successUrl: string
  failureUrl: string
  webhookUrl?: string
}

export class ChargilyProvider extends AbstractPaymentProvider {
  readonly name = 'chargily'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib', 'edahabia']

  private baseUrl: string

  constructor(private config: ChargilyConfig) {
    super()
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

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
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

  protected async doVerifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    // Chargily signs with HMAC-SHA256 using the API key as secret
    const computed = createHmac('sha256', this.config.apiKey).update(body).digest('hex')
    if (computed !== signature) {
      throw new Error('[chargily] Invalid webhook signature')
    }

    const raw = JSON.parse(body)

    // Chargily Pay v2 wrappe le checkout dans un event object :
    //   { id, entity:'event', type:'checkout.paid', data: <Checkout>, ... }
    // Les anciens flows / tests directs envoient juste le Checkout
    // (sans wrapper). On supporte les 2.
    const isEventWrapper = raw?.entity === 'event' && raw?.data
    const checkout = isEventWrapper ? raw.data : raw
    const explicitEventType: string | null =
      isEventWrapper && typeof raw.type === 'string' ? raw.type : null

    // Type d'event normalisé : utilise le `type` explicite Chargily v2
    // s'il est présent (`checkout.paid`/`checkout.failed`/`checkout.canceled`),
    // sinon fallback sur le mapping via `checkout.status`.
    let type: string
    if (explicitEventType) {
      type = explicitEventType
    } else {
      type = checkout.status === 'paid' ? 'payment.success'
        : checkout.status === 'failed' ? 'payment.failed'
        : checkout.status === 'canceled' ? 'payment.canceled'
        : 'payment.pending'
    }

    return {
      type,
      data: {
        checkoutId: checkout.id,
        amount: checkout.amount,
        currency: checkout.currency,
        status: checkout.status,
        metadata: checkout.metadata,
        orderId: checkout.metadata?.orderId,
      },
      raw,
    }
  }
}

/**
 * Create a Chargily provider from environment variables.
 *
 * Convention env (cohérence avec Stripe `STRIPE_SECRET_KEY`) :
 *   - `CHARGILY_SECRET_KEY` (recommandé) — clé secrète côté serveur
 *   - `CHARGILY_API_KEY` (legacy alias) — gardé pour rétro-compat des
 *     déploiements existants. À retirer dans une future major version.
 *
 * `getEnv()` résout la cascade @mostajs/config (`PROD_*`/`TEST_*`/`DEV_*`
 * selon `MOSTA_ENV`) puis fallback non-préfixé.
 */
export function createChargilyProvider(config?: Partial<ChargilyConfig>): ChargilyProvider {
  return new ChargilyProvider({
    apiKey: config?.apiKey ?? getEnv('CHARGILY_SECRET_KEY') ?? getEnv('CHARGILY_API_KEY', ''),
    testMode: config?.testMode ?? getEnv('CHARGILY_TEST_MODE') !== 'false',
    successUrl: config?.successUrl ?? getEnv('CHARGILY_SUCCESS_URL', '/payment/success'),
    failureUrl: config?.failureUrl ?? getEnv('CHARGILY_FAILURE_URL', '/payment/failed'),
    webhookUrl: config?.webhookUrl ?? getEnv('CHARGILY_WEBHOOK_URL'),
  })
}
