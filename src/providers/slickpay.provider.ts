// @mostajs/payment — SlickPay provider (agrégateur Algérie : CIB + EDAHABIA via SATIM)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://developers.slick-pay.com/ · SDK npm @slick-pay-algeria/slickpay-npm
//
// API v2 : auth par clé publique (Bearer), création d'« invoice » qui redirige le
// payeur vers la page de paiement, puis confirmation par interrogation du statut.
// Les chemins/URL sont PILOTABLES PAR ENV (corrigeables sans toucher au code, §10)
// — valeurs par défaut conformes à la doc v2, à confirmer en certification GIE.

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'

export interface SlickPayConfig {
  publicKey: string
  testMode?: boolean
  /** Base API (sans slash final). Défaut test/prod v2. */
  baseUrl?: string
  /** Chemin de création d'invoice. Défaut '/users/invoices'. */
  invoicePath?: string
  /** URL de retour par défaut si non fournie au checkout. */
  returnUrl?: string
}

export class SlickPayProvider extends AbstractPaymentProvider {
  readonly name = 'slickpay'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib', 'edahabia']

  private baseUrl: string
  private invoicePath: string

  constructor(private config: SlickPayConfig) {
    super()
    this.baseUrl = config.baseUrl ?? (config.testMode
      ? 'https://devapi.slick-pay.com/api/v2'
      : 'https://prodapi.slick-pay.com/api/v2')
    this.invoicePath = config.invoicePath ?? '/users/invoices'
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.config.publicKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  /** URL de retour avec orderId propagé (matching au retour). */
  private returnWithOrder(url: string, orderId: string): string {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}orderId=${encodeURIComponent(orderId)}`
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const url = this.returnWithOrder(params.successUrl ?? this.config.returnUrl ?? '/', params.orderId)
    const res = await fetch(`${this.baseUrl}${this.invoicePath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: params.amount,                 // DZD (montant réel, pas centimes)
        url,                                   // retour navigateur après paiement
        webhook_url: params.webhookUrl,        // notification serveur (si supporté)
        note: params.description ?? `Commande ${params.orderId}`,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[slickpay] Checkout failed: ${err.message ?? res.statusText}`)
    }
    const data = await res.json()
    // v2 : { success, url|redirect_url, id }
    return { url: data.url ?? data.redirect_url ?? null, sessionId: String(data.id ?? data.uuid ?? '') }
  }

  /** Statut d'une invoice par id (confirmation serveur). */
  async getInvoice(id: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}${this.invoicePath}/${id}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`[slickpay] Get invoice failed: ${res.statusText}`)
    return res.json()
  }

  /** Mappe un statut SlickPay vers un type d'event normalisé (pur, testable). */
  static mapStatus(raw: Record<string, any>): string {
    const v = raw?.completed ?? raw?.status ?? raw?.state
    const s = String(v).toLowerCase()
    if (v === 1 || v === true || s === 'completed' || s === 'paid' || s === 'success') return 'payment.success'
    if (s === 'failed' || s === 'cancelled' || s === 'canceled' || s === 'declined') return 'payment.failed'
    if (s === 'refunded') return 'payment.refunded'
    return 'payment.pending'
  }

  protected async doVerifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // SlickPay : confirmation par retour + interrogation statut (pas de HMAC).
    // Accepte un JSON déjà résolu ({orderId,status/completed} — testable hors-ligne)
    // ou un JSON {id} → interrogation API.
    let raw: Record<string, any> = {}
    try { raw = JSON.parse(body) } catch { raw = Object.fromEntries(new URLSearchParams(body)) }

    let status: Record<string, any> = raw
    const id = raw.id ?? raw.invoice ?? raw.uuid
    if (raw.completed === undefined && raw.status === undefined && raw.state === undefined && id) {
      status = await this.getInvoice(String(id))
      status = (status as any).data ?? status
    }
    return {
      type: SlickPayProvider.mapStatus(status),
      data: {
        orderId: raw.orderId ?? status.orderId ?? (status as any).merchant_order_id,
        invoiceId: id ?? status.id,
        amount: status.amount,
        currency: 'DZD',
        status: status.completed ?? status.status ?? status.state,
      },
      raw: status,
    }
  }
}

/**
 * Crée un provider SlickPay depuis l'environnement (cascade @mostajs/config).
 * Env : SLICKPAY_PUBLIC_KEY, SLICKPAY_TEST_MODE, SLICKPAY_BASE_URL,
 *       SLICKPAY_INVOICE_PATH, SLICKPAY_RETURN_URL.
 */
export function createSlickPayProvider(config?: Partial<SlickPayConfig>): SlickPayProvider {
  return new SlickPayProvider({
    publicKey: config?.publicKey ?? getEnv('SLICKPAY_PUBLIC_KEY', ''),
    testMode: config?.testMode ?? getEnv('SLICKPAY_TEST_MODE') !== 'false',
    baseUrl: config?.baseUrl ?? getEnv('SLICKPAY_BASE_URL'),
    invoicePath: config?.invoicePath ?? getEnv('SLICKPAY_INVOICE_PATH'),
    returnUrl: config?.returnUrl ?? getEnv('SLICKPAY_RETURN_URL', '/payment/success'),
  })
}
