// @mostajs/payment — Satim/GIE Monetique provider (CIB — Algerie)
// Author: Dr Hamid MADANI drmdh@msn.com
// Ref: https://test.satim.dz/payment/rest/ (sandbox)

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'
import { getEnv, getEnvBool } from '@mostajs/config'

export interface SatimConfig {
  merchantId: string
  password: string
  testMode?: boolean
  returnUrl: string
  failUrl: string
  /** ISO 4217 currency code, default '012' (DZD) */
  currencyCode?: string
}

export class SatimProvider extends AbstractPaymentProvider {
  readonly name = 'satim'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib']

  private baseUrl: string

  constructor(private config: SatimConfig) {
    super()
    this.baseUrl = config.testMode
      ? 'https://test.satim.dz/payment/rest'
      : 'https://cib.satim.dz/payment/rest'
  }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const body = new URLSearchParams({
      orderNumber: params.orderId,
      amount: String(Math.round(params.amount * 100)), // centimes DZD
      currency: this.config.currencyCode ?? '012', // ISO 4217 DZD
      returnUrl: params.successUrl ?? this.config.returnUrl,
      failUrl: params.cancelUrl ?? this.config.failUrl,
      userName: this.config.merchantId,
      password: this.config.password,
      language: 'FR',
    })

    if (params.description) body.set('description', params.description)
    // jsonParams : champs libres (dont orderId) restitués dans getOrderStatusExtended
    if (params.metadata && Object.keys(params.metadata).length) {
      body.set('jsonParams', JSON.stringify(params.metadata))
    }

    const res = await fetch(`${this.baseUrl}/register.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await res.json()

    if (data.errorCode && data.errorCode !== '0') {
      throw new Error(`[satim] ${data.errorMessage ?? 'Registration failed'} (code: ${data.errorCode})`)
    }

    return { url: data.formUrl, sessionId: data.orderId }
  }

  /**
   * Confirm an order after redirect callback.
   * Call this when Satim redirects back to returnUrl.
   */
  async confirmOrder(orderId: string): Promise<{ paid: boolean; actionCode: string; errorMessage?: string }> {
    const body = new URLSearchParams({
      orderId,
      userName: this.config.merchantId,
      password: this.config.password,
      language: 'FR',
    })

    const res = await fetch(`${this.baseUrl}/confirmOrder.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await res.json()
    return {
      paid: data.actionCode === 0 || data.actionCode === '0',
      actionCode: String(data.actionCode),
      errorMessage: data.ErrorMessage ?? data.errorMessage,
    }
  }

  /**
   * Get order status.
   */
  async getOrderStatus(orderId: string): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({
      orderId,
      userName: this.config.merchantId,
      password: this.config.password,
      language: 'FR',
    })

    const res = await fetch(`${this.baseUrl}/getOrderStatus.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    return res.json()
  }

  /**
   * Statut SATIM/BPC enrichi par identifiant de commande SATIM (mdOrder).
   * Champs clés : OrderStatus, OrderNumber (= notre orderId), Amount (centimes),
   * actionCode, approvalCode, ErrorCode.
   */
  async getOrderStatusExtended(satimOrderId: string): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({
      orderId: satimOrderId,
      userName: this.config.merchantId,
      password: this.config.password,
      language: 'FR',
    })
    const res = await fetch(`${this.baseUrl}/getOrderStatusExtended.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    return res.json()
  }

  /**
   * Mappe un code OrderStatus BPC vers un type d'event normalisé.
   * Codes BPC : 0 enregistré · 1 pré-autorisé · 2 **autorisé/payé** ·
   * 3 annulé · 4 remboursé · 5 ACS/3-DS en cours · 6 refusé.
   */
  static mapOrderStatus(code: number | string | undefined): string {
    switch (String(code)) {
      case '2': return 'payment.success'
      case '4': return 'payment.refunded'
      case '3':
      case '6': return 'payment.failed'
      default:  return 'payment.pending' // 0,1,5 ou inconnu
    }
  }

  protected async doVerifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // SATIM = callback PAR REDIRECTION (pas de webhook signé) : le handler de
    // retour reçoit l'orderId SATIM (mdOrder) ; on confirme le statut côté serveur
    // via getOrderStatusExtended. Accepte : querystring de retour, JSON {orderId},
    // ou JSON déjà résolu (OrderStatus présent → pas d'appel réseau, testable).
    const trimmed = body.trim()
    let raw: Record<string, any> = {}
    if (trimmed.startsWith('{')) { try { raw = JSON.parse(trimmed) } catch { raw = {} } }
    else { raw = Object.fromEntries(new URLSearchParams(body)) }

    const satimOrderId = raw.orderId ?? raw.mdOrder
    let status: Record<string, any> = raw
    if (raw.OrderStatus === undefined && raw.orderStatus === undefined && satimOrderId) {
      status = await this.getOrderStatusExtended(String(satimOrderId))
    }

    const code = status.OrderStatus ?? status.orderStatus
    const orderNumber = status.OrderNumber ?? status.orderNumber ?? raw.orderNumber
    const amount = status.Amount !== undefined ? Number(status.Amount) / 100 : undefined
    const type = code !== undefined
      ? SatimProvider.mapOrderStatus(code)
      : (String(raw.actionCode) === '0' ? 'payment.success' : 'payment.pending')

    return {
      type,
      data: {
        orderId: orderNumber ?? satimOrderId, // OrderNumber = notre orderId (matching)
        satimOrderId,
        orderStatus: code,
        amount,
        currency: 'DZD',
        approvalCode: status.approvalCode ?? status.ApprovalCode,
        errorCode: status.ErrorCode ?? status.errorCode,
      },
      raw: status,
    }
  }
}

/**
 * Create a Satim provider from environment variables.
 */
export function createSatimProvider(config?: Partial<SatimConfig>): SatimProvider {
  return new SatimProvider({
    merchantId: config?.merchantId ?? getEnv('SATIM_MERCHANT_ID', ''),
    password: config?.password ?? getEnv('SATIM_PASSWORD', ''),
    testMode: config?.testMode ?? getEnvBool('SATIM_TEST_MODE'),
    returnUrl: config?.returnUrl ?? getEnv('SATIM_RETURN_URL', '/payment/callback'),
    failUrl: config?.failUrl ?? getEnv('SATIM_FAIL_URL', '/payment/failed'),
  })
}
