// @mostajs/payment — Coinbase Commerce provider (crypto : BTC, ETH, USDC…)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://docs.cloud.coinbase.com/commerce/ · API charges + webhook HMAC-SHA256
//
// Crypto via page hébergée : on crée une « charge » (prix fixe en fiat), le payeur
// règle en crypto, un webhook signé HMAC-SHA256 confirme. Opt-in (via providerName).

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'
import { createHmac } from 'node:crypto'

export interface CoinbaseConfig {
  apiKey: string
  webhookSecret?: string
  baseUrl?: string
}

export class CoinbaseProvider extends AbstractPaymentProvider {
  readonly name = 'coinbase'
  readonly supportedCurrencies = ['*'] // prix en fiat, règlement crypto
  readonly supportedMethods = ['crypto']

  private baseUrl: string

  constructor(private config: CoinbaseConfig) {
    super()
    this.baseUrl = config.baseUrl ?? 'https://api.commerce.coinbase.com'
  }

  private headers() {
    return {
      'X-CC-Api-Key': this.config.apiKey,
      'X-CC-Version': '2018-03-22',
      'Content-Type': 'application/json',
    }
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/charges`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: params.description ?? `Commande ${params.orderId}`,
        description: params.description ?? `Commande ${params.orderId}`,
        pricing_type: 'fixed_price',
        local_price: { amount: String(params.amount), currency: (params.currency ?? 'USD').toUpperCase() },
        metadata: params.metadata,
        redirect_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[coinbase] Checkout failed: ${err.error?.message ?? res.statusText}`)
    }
    const json = await res.json()
    const d = json.data ?? json
    return { url: d.hosted_url ?? null, sessionId: String(d.id ?? d.code ?? '') }
  }

  /** Mappe un type d'event Coinbase Commerce vers le type normalisé. */
  static mapEvent(type: string | undefined): string {
    switch (String(type)) {
      case 'charge:confirmed':
      case 'charge:resolved': return 'payment.success'
      case 'charge:failed':   return 'payment.failed'
      default:                return 'payment.pending' // charge:created/pending/delayed
    }
  }

  protected async doVerifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    if (this.config.webhookSecret) {
      const computed = createHmac('sha256', this.config.webhookSecret).update(body).digest('hex')
      if (computed !== signature) throw new Error('[coinbase] Invalid webhook signature')
    }
    const raw = JSON.parse(body)
    const event = raw.event ?? raw
    const charge = event.data ?? {}
    const local = charge.pricing?.local
    return {
      type: CoinbaseProvider.mapEvent(event.type),
      data: {
        orderId: charge.metadata?.orderId,
        chargeId: charge.id ?? charge.code,
        amount: local ? Number(local.amount) : undefined,
        currency: local?.currency,
        status: event.type,
      },
      raw,
    }
  }
}

/**
 * Crée un provider Coinbase Commerce depuis l'env (cascade @mostajs/config).
 * Env : COINBASE_COMMERCE_API_KEY, COINBASE_COMMERCE_WEBHOOK_SECRET.
 */
export function createCoinbaseProvider(config?: Partial<CoinbaseConfig>): CoinbaseProvider {
  return new CoinbaseProvider({
    apiKey: config?.apiKey ?? getEnv('COINBASE_COMMERCE_API_KEY', ''),
    webhookSecret: config?.webhookSecret ?? getEnv('COINBASE_COMMERCE_WEBHOOK_SECRET'),
    baseUrl: config?.baseUrl ?? getEnv('COINBASE_COMMERCE_BASE_URL'),
  })
}
