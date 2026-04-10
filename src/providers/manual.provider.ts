// @mostajs/payment — Manual provider (cash, bank transfer, TPE)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'

export interface ManualConfig {
  bankInfo?: { rib: string; bankName: string; holder: string }
  confirmationUrl?: string
}

export class ManualProvider implements PaymentProvider {
  readonly name = 'manual'
  readonly supportedCurrencies = ['*']
  readonly supportedMethods = ['cash', 'transfer', 'tpe']

  constructor(private config: ManualConfig = {}) {}

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    // No external redirect — return confirmation page URL
    const url = this.config.confirmationUrl
      ? `${this.config.confirmationUrl}?orderId=${params.orderId}`
      : params.successUrl
    return { url, sessionId: `manual_${params.orderId}` }
  }

  async verifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    const data = JSON.parse(body)
    return { type: 'payment.manual', data }
  }
}

export function createManualProvider(config?: ManualConfig): ManualProvider {
  return new ManualProvider(config)
}
