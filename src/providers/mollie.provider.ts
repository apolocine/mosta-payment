// @mostajs/payment — Mollie provider (Europe : iDEAL, SEPA, cartes, Apple/Google Pay)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://docs.mollie.com/reference/v2/payments-api/ · webhook NON signé → re-fetch statut

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'

export interface MollieConfig {
  apiKey: string
  baseUrl?: string
}

export class MollieProvider extends AbstractPaymentProvider {
  readonly name = 'mollie'
  readonly supportedCurrencies = ['EUR', 'GBP']
  readonly supportedMethods = ['card', 'ideal', 'sepa', 'applepay', 'googlepay', 'bancontact']

  private baseUrl: string

  constructor(private config: MollieConfig) {
    super()
    this.baseUrl = config.baseUrl ?? 'https://api.mollie.com/v2'
  }

  private headers() {
    return { 'Authorization': `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' }
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: { currency: (params.currency ?? 'EUR').toUpperCase(), value: params.amount.toFixed(2) },
        description: params.description ?? `Commande ${params.orderId}`,
        redirectUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        webhookUrl: params.webhookUrl,
        metadata: { orderId: params.orderId, ...params.metadata },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[mollie] Checkout failed: ${err.detail ?? res.statusText}`)
    }
    const data = await res.json()
    return { url: data._links?.checkout?.href ?? null, sessionId: String(data.id ?? '') }
  }

  /** Statut d'un paiement par id (le webhook Mollie n'envoie que l'id). */
  async getPayment(id: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/payments/${id}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`[mollie] Get payment failed: ${res.statusText}`)
    return res.json()
  }

  /** Mappe un statut Mollie → type normalisé. */
  static mapStatus(s: string | undefined): string {
    switch (String(s)) {
      case 'paid':     return 'payment.success'
      case 'refunded': return 'payment.refunded'
      case 'failed':
      case 'canceled':
      case 'expired':  return 'payment.failed'
      default:         return 'payment.pending' // open/pending/authorized
    }
  }

  protected async doVerifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // Mollie ne signe pas : le webhook envoie `id=tr_xxx` → on RE-INTERROGE le statut.
    // Accepte aussi un JSON déjà résolu ({id,status,metadata}) → testable hors-ligne.
    let raw: Record<string, any> = {}
    const trimmed = body.trim()
    if (trimmed.startsWith('{')) { try { raw = JSON.parse(trimmed) } catch { raw = {} } }
    else { raw = Object.fromEntries(new URLSearchParams(body)) }

    const id = raw.id
    let payment: Record<string, any> = raw
    if (raw.status === undefined && id) payment = await this.getPayment(String(id))

    return {
      type: MollieProvider.mapStatus(payment.status),
      data: {
        orderId: payment.metadata?.orderId ?? raw.orderId,
        paymentId: payment.id ?? id,
        amount: payment.amount?.value !== undefined ? Number(payment.amount.value) : undefined,
        currency: payment.amount?.currency,
        status: payment.status,
      },
      raw: payment,
    }
  }
}

/**
 * Crée un provider Mollie depuis l'env (cascade @mostajs/config).
 * Env : MOLLIE_API_KEY.
 */
export function createMollieProvider(config?: Partial<MollieConfig>): MollieProvider {
  return new MollieProvider({
    apiKey: config?.apiKey ?? getEnv('MOLLIE_API_KEY', ''),
    baseUrl: config?.baseUrl ?? getEnv('MOLLIE_BASE_URL'),
  })
}
