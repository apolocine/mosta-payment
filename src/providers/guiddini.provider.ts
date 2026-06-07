// @mostajs/payment — Guiddini provider (agrégateur Algérie : CIB + EDAHABIA via SATIM)
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Ref: https://guiddini.dz/docs/api/satim · >100 marchands certifiés SATIM
//
// Guiddini Pay : agrégateur SATIM (clé/secret applicatifs). Flux : initiation →
// redirection vers la page SATIM → confirmation par interrogation du statut.
// La doc publique étant rendue côté client, les chemins/URL sont PILOTABLES PAR
// ENV (corrigeables sans toucher au code, §10) — défauts provisoires à confirmer
// en certification GIE Monétique.

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv } from '@mostajs/config'

export interface GuiddiniConfig {
  appKey: string
  appSecret: string
  testMode?: boolean
  /** Base API (sans slash final). Pilotable par env. */
  baseUrl?: string
  /** Chemin d'initiation de paiement. Défaut '/transactions/initiate'. */
  initiatePath?: string
  /** Chemin de statut (avec {id}). Défaut '/transactions'. */
  statusPath?: string
  returnUrl?: string
}

export class GuiddiniProvider extends AbstractPaymentProvider {
  readonly name = 'guiddini'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib', 'edahabia']

  private baseUrl: string
  private initiatePath: string
  private statusPath: string

  constructor(private config: GuiddiniConfig) {
    super()
    this.baseUrl = config.baseUrl ?? (config.testMode
      ? 'https://epay.guiddini.dz/api/test'
      : 'https://epay.guiddini.dz/api')
    this.initiatePath = config.initiatePath ?? '/transactions/initiate'
    this.statusPath = config.statusPath ?? '/transactions'
  }

  private headers() {
    return {
      'x-app-key': this.config.appKey,
      'x-app-secret': this.config.appSecret,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}${this.initiatePath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: params.amount,                 // DZD
        order_number: params.orderId,          // notre référence (matching)
        return_url: params.successUrl ?? this.config.returnUrl,
        fail_url: params.cancelUrl,
        description: params.description ?? `Commande ${params.orderId}`,
        meta: params.metadata,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[guiddini] Checkout failed: ${err.message ?? res.statusText}`)
    }
    const data = await res.json()
    const d = (data as any).data ?? data
    // { form_url|redirect_url|checkout_url, order_id|id }
    return {
      url: d.form_url ?? d.redirect_url ?? d.checkout_url ?? null,
      sessionId: String(d.order_id ?? d.id ?? d.transaction_id ?? ''),
    }
  }

  /** Statut d'une transaction Guiddini par id. */
  async getTransaction(id: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}${this.statusPath}/${id}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`[guiddini] Get transaction failed: ${res.statusText}`)
    return res.json()
  }

  /** Mappe un statut Guiddini/SATIM vers un type d'event normalisé (pur, testable). */
  static mapStatus(raw: Record<string, any>): string {
    const s = String(raw?.status ?? raw?.state ?? raw?.order_status ?? '').toLowerCase()
    if (s === 'paid' || s === 'success' || s === 'completed' || s === 'confirmed' || raw?.order_status === 2) return 'payment.success'
    if (s === 'failed' || s === 'declined' || s === 'cancelled' || s === 'canceled') return 'payment.failed'
    if (s === 'refunded') return 'payment.refunded'
    return 'payment.pending'
  }

  protected async doVerifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // Confirmation par retour + interrogation. Accepte un JSON déjà résolu
    // ({order_number,status} — testable hors-ligne) ou un JSON {id} → interrogation.
    let raw: Record<string, any> = {}
    try { raw = JSON.parse(body) } catch { raw = Object.fromEntries(new URLSearchParams(body)) }
    const env = (raw as any).data ?? raw

    let status: Record<string, any> = env
    const id = env.id ?? env.order_id ?? env.transaction_id
    if (env.status === undefined && env.order_status === undefined && id) {
      const fetched = await this.getTransaction(String(id))
      status = (fetched as any).data ?? fetched
    }
    return {
      type: GuiddiniProvider.mapStatus(status),
      data: {
        orderId: env.order_number ?? status.order_number ?? status.orderId,
        transactionId: id ?? status.id,
        amount: status.amount,
        currency: 'DZD',
        status: status.status ?? status.order_status,
      },
      raw: status,
    }
  }
}

/**
 * Crée un provider Guiddini depuis l'environnement (cascade @mostajs/config).
 * Env : GUIDDINI_APP_KEY, GUIDDINI_APP_SECRET, GUIDDINI_TEST_MODE,
 *       GUIDDINI_BASE_URL, GUIDDINI_INITIATE_PATH, GUIDDINI_STATUS_PATH, GUIDDINI_RETURN_URL.
 */
export function createGuiddiniProvider(config?: Partial<GuiddiniConfig>): GuiddiniProvider {
  return new GuiddiniProvider({
    appKey: config?.appKey ?? getEnv('GUIDDINI_APP_KEY', ''),
    appSecret: config?.appSecret ?? getEnv('GUIDDINI_APP_SECRET', ''),
    testMode: config?.testMode ?? getEnv('GUIDDINI_TEST_MODE') !== 'false',
    baseUrl: config?.baseUrl ?? getEnv('GUIDDINI_BASE_URL'),
    initiatePath: config?.initiatePath ?? getEnv('GUIDDINI_INITIATE_PATH'),
    statusPath: config?.statusPath ?? getEnv('GUIDDINI_STATUS_PATH'),
    returnUrl: config?.returnUrl ?? getEnv('GUIDDINI_RETURN_URL', '/payment/success'),
  })
}
