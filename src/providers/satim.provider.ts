// @mostajs/payment — Satim/GIE Monetique provider (CIB — Algerie)
// Author: Dr Hamid MADANI drmdh@msn.com
// Ref: https://test.satim.dz/payment/rest/ (sandbox)

import type { PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'

export interface SatimConfig {
  merchantId: string
  password: string
  testMode?: boolean
  returnUrl: string
  failUrl: string
  /** ISO 4217 currency code, default '012' (DZD) */
  currencyCode?: string
}

export class SatimProvider implements PaymentProvider {
  readonly name = 'satim'
  readonly supportedCurrencies = ['DZD']
  readonly supportedMethods = ['cib']

  private baseUrl: string

  constructor(private config: SatimConfig) {
    this.baseUrl = config.testMode
      ? 'https://test.satim.dz/payment/rest'
      : 'https://cib.satim.dz/payment/rest'
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
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

  async verifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // Satim uses redirect-based callbacks, not webhooks
    // Parse the callback params
    const params = new URLSearchParams(body)
    const orderId = params.get('orderId') ?? ''

    if (orderId) {
      const status = await this.confirmOrder(orderId)
      return {
        type: status.paid ? 'payment.success' : 'payment.failed',
        data: { orderId, ...status },
      }
    }

    return { type: 'unknown', data: {} }
  }
}

/**
 * Create a Satim provider from environment variables.
 */
export function createSatimProvider(config?: Partial<SatimConfig>): SatimProvider {
  return new SatimProvider({
    merchantId: config?.merchantId ?? process.env.SATIM_MERCHANT_ID ?? '',
    password: config?.password ?? process.env.SATIM_PASSWORD ?? '',
    testMode: config?.testMode ?? process.env.SATIM_TEST_MODE === 'true',
    returnUrl: config?.returnUrl ?? process.env.SATIM_RETURN_URL ?? '/payment/callback',
    failUrl: config?.failUrl ?? process.env.SATIM_FAIL_URL ?? '/payment/failed',
  })
}
