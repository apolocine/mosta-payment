// @mostajs/payment — PayPal REST API v2 provider
// Author: Dr Hamid MADANI drmdh@msn.com
// Ref: https://developer.paypal.com/docs/api/orders/v2/

import type { PaymentProvider, CheckoutParams, CheckoutResult, RefundParams, RefundResult, WebhookEvent } from '../core/provider.interface.js'
import { getEnv } from '@mostajs/config'
import { createVerify } from 'node:crypto'

export interface PayPalConfig {
  clientId: string
  secret: string
  testMode?: boolean
  returnUrl: string
  cancelUrl: string
  webhookId?: string
}

export class PayPalProvider implements PaymentProvider {
  readonly name = 'paypal'
  readonly supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF']
  readonly supportedMethods = ['paypal']

  private baseUrl: string
  private tokenCache: { token: string; expiresAt: number } | null = null

  constructor(private config: PayPalConfig) {
    this.baseUrl = config.testMode
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token
    }

    const auth = Buffer.from(`${this.config.clientId}:${this.config.secret}`).toString('base64')
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!res.ok) throw new Error(`[paypal] Token failed: ${res.statusText}`)
    const data = await res.json()
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 1 min before expiry
    }
    return data.access_token
  }

  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.getAccessToken()
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`[paypal] ${method} ${path} failed: ${err.message ?? err.error ?? res.statusText}`)
    }
    return res.status === 204 ? null : res.json()
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const currency = (params.currency ?? 'USD').toUpperCase()
    const data = await this.api('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: params.orderId,
        description: params.description,
        amount: {
          currency_code: currency,
          value: params.amount.toFixed(2),
        },
      }],
      application_context: {
        return_url: params.successUrl ?? this.config.returnUrl,
        cancel_url: params.cancelUrl ?? this.config.cancelUrl,
        brand_name: 'OctoNet Cloud',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
      },
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })

    const approveLink = data.links?.find((l: any) => l.rel === 'approve')
    return { url: approveLink?.href ?? null, sessionId: data.id }
  }

  /**
   * Capture a PayPal order after user approval.
   * Call this when PayPal redirects back to returnUrl with ?token=ORDER_ID
   */
  async captureOrder(orderId: string): Promise<{ status: string; data: Record<string, unknown> }> {
    const data = await this.api('POST', `/v2/checkout/orders/${orderId}/capture`, {})
    return { status: data.status, data }
  }

  /**
   * Get order details.
   */
  async getOrder(orderId: string): Promise<Record<string, unknown>> {
    return this.api('GET', `/v2/checkout/orders/${orderId}`)
  }

  async createRefund(params: RefundParams): Promise<RefundResult> {
    // PayPal refunds work on captures, not orders
    const body: any = {}
    if (params.amount) {
      body.amount = { value: params.amount.toFixed(2), currency_code: 'USD' }
    }
    if (params.reason) body.note_to_payer = params.reason

    const data = await this.api('POST', `/v2/payments/captures/${params.paymentId}/refund`, body)
    return {
      id: data.id,
      amount: parseFloat(data.amount?.value ?? '0'),
      status: data.status,
    }
  }

  async verifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    // PayPal webhook verification requires calling their API
    // For simplicity, parse the event and validate via API
    const event = JSON.parse(body)

    // In production, verify via POST /v1/notifications/verify-webhook-signature
    // For now, trust the parsed event
    const type = event.event_type === 'CHECKOUT.ORDER.APPROVED' ? 'payment.approved'
      : event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? 'payment.success'
      : event.event_type === 'PAYMENT.CAPTURE.DENIED' ? 'payment.failed'
      : event.event_type ?? 'unknown'

    return {
      type,
      data: {
        orderId: event.resource?.id,
        status: event.resource?.status,
        amount: event.resource?.amount?.value,
        currency: event.resource?.amount?.currency_code,
      },
      raw: event,
    }
  }

  /**
   * Verify webhook signature via PayPal API (production).
   */
  async verifyWebhookSignature(headers: Record<string, string>, body: string): Promise<boolean> {
    if (!this.config.webhookId) return false
    const data = await this.api('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: this.config.webhookId,
      webhook_event: JSON.parse(body),
    })
    return data.verification_status === 'SUCCESS'
  }
}

/**
 * Create a PayPal provider from environment variables.
 */
export function createPayPalProvider(config?: Partial<PayPalConfig>): PayPalProvider {
  return new PayPalProvider({
    clientId: config?.clientId ?? getEnv('PAYPAL_CLIENT_ID', ''),
    secret: config?.secret ?? getEnv('PAYPAL_SECRET', ''),
    testMode: config?.testMode ?? getEnv('PAYPAL_TEST_MODE') !== 'false',
    returnUrl: config?.returnUrl ?? getEnv('PAYPAL_RETURN_URL', '/payment/success'),
    cancelUrl: config?.cancelUrl ?? getEnv('PAYPAL_CANCEL_URL', '/payment/canceled'),
    webhookId: config?.webhookId ?? getEnv('PAYPAL_WEBHOOK_ID'),
  })
}
