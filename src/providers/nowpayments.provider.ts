// @mostajs/payment — NOWPayments provider (crypto, invoice hébergée)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://documenter.getpostman.com/view/7907941/ · IPN HMAC-SHA512 (clés triées)
//
// Invoice hébergée : prix en fiat, règlement crypto, IPN signé HMAC-SHA512 calculé
// sur le JSON aux clés TRIÉES. Opt-in (via providerName).

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'
import { createHmac } from 'node:crypto'

export interface NowPaymentsConfig {
  apiKey: string
  ipnSecret?: string
  baseUrl?: string
}

/** Sérialise un objet avec clés triées récursivement (exigence IPN NOWPayments). */
function sortedJson(obj: any): string {
  const sort = (v: any): any => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = sort(v[k]); return acc }, {})
    }
    return v
  }
  return JSON.stringify(sort(obj))
}

export class NowPaymentsProvider extends AbstractPaymentProvider {
  readonly name = 'nowpayments'
  readonly supportedCurrencies = ['*'] // prix fiat, règlement crypto
  readonly supportedMethods = ['crypto']

  private baseUrl: string

  constructor(private config: NowPaymentsConfig) {
    super()
    this.baseUrl = config.baseUrl ?? 'https://api.nowpayments.io/v1'
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': this.config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: params.amount,
        price_currency: (params.currency ?? 'usd').toLowerCase(),
        order_id: params.orderId,
        order_description: params.description ?? `Commande ${params.orderId}`,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        ipn_callback_url: params.webhookUrl,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[nowpayments] Checkout failed: ${err.message ?? res.statusText}`)
    }
    const data = await res.json()
    return { url: data.invoice_url ?? null, sessionId: String(data.id ?? '') }
  }

  /** Mappe payment_status NOWPayments → type normalisé. */
  static mapStatus(s: string | undefined): string {
    switch (String(s)) {
      case 'finished':
      case 'confirmed':       return 'payment.success'
      case 'refunded':        return 'payment.refunded'
      case 'failed':
      case 'expired':         return 'payment.failed'
      default:                return 'payment.pending' // waiting/confirming/sending/partially_paid
    }
  }

  protected async doVerifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    const raw = JSON.parse(body)
    if (this.config.ipnSecret) {
      const computed = createHmac('sha512', this.config.ipnSecret).update(sortedJson(raw)).digest('hex')
      if (computed !== signature) throw new Error('[nowpayments] Invalid IPN signature')
    }
    return {
      type: NowPaymentsProvider.mapStatus(raw.payment_status),
      data: {
        orderId: raw.order_id,
        paymentId: raw.payment_id,
        amount: raw.price_amount,
        currency: raw.price_currency,
        status: raw.payment_status,
      },
      raw,
    }
  }
}

/**
 * Crée un provider NOWPayments depuis l'env (cascade @mostajs/config).
 * Env : NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET.
 */
export function createNowPaymentsProvider(config?: Partial<NowPaymentsConfig>): NowPaymentsProvider {
  return new NowPaymentsProvider({
    apiKey: config?.apiKey ?? getEnv('NOWPAYMENTS_API_KEY', ''),
    ipnSecret: config?.ipnSecret ?? getEnv('NOWPAYMENTS_IPN_SECRET'),
    baseUrl: config?.baseUrl ?? getEnv('NOWPAYMENTS_BASE_URL'),
  })
}
