// @mostajs/payment — Manual provider (cash, bank transfer, TPE)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { CheckoutParams, CheckoutResult, WebhookEvent } from '../core/provider.interface.js'
import { AbstractPaymentProvider } from '../core/abstract-provider.js'

export interface ManualConfig {
  bankInfo?: { rib: string; bankName: string; holder: string }
  confirmationUrl?: string
}

export class ManualProvider extends AbstractPaymentProvider {
  readonly name = 'manual'
  readonly supportedCurrencies = ['*']
  readonly supportedMethods = ['cash', 'transfer', 'tpe']

  constructor(private config: ManualConfig = {}) { super() }

  protected async doCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    // No external redirect — return confirmation page URL
    const url = this.config.confirmationUrl
      ? `${this.config.confirmationUrl}?orderId=${params.orderId}`
      : params.successUrl
    return { url, sessionId: `manual_${params.orderId}` }
  }

  protected async doVerifyWebhook(body: string, _signature: string): Promise<WebhookEvent> {
    // Confirmation manuelle (caissier / virement validé) : un POST
    // { orderId, status:'paid' } (ou { paid:true }) déclenche un event de
    // succès normalisé. Sans marqueur de paiement → event neutre 'payment.manual'.
    const data = JSON.parse(body)
    const paid = data?.status === 'paid' || data?.paid === true || data?.event === 'paid'
    const orderId = data?.orderId ?? data?.metadata?.orderId
    return {
      type: paid ? 'payment.success' : 'payment.manual',
      data: { ...data, ...(orderId ? { orderId } : {}) },
    }
  }
}

export function createManualProvider(config?: ManualConfig): ManualProvider {
  return new ManualProvider(config)
}
