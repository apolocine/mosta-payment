// @mostajs/payment — Stripe provider (refactored from lib/stripe.ts)
// Author: Dr Hamid MADANI drmdh@msn.com

import Stripe from 'stripe'
import { getEnv } from '@mostajs/config'
import type {
  PaymentProvider, CheckoutParams, CheckoutResult, CustomerParams,
  SubscriptionParams, SubscriptionResult, RefundParams, RefundResult,
  InvoiceResult, WebhookEvent,
} from '../core/provider.interface.js'

export interface StripeConfig {
  secretKey: string
  webhookSecret?: string
}

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe'
  readonly supportedCurrencies = ['*'] // all currencies
  readonly supportedMethods = ['card']

  public stripe: Stripe

  constructor(private config: StripeConfig) {
    if (!config.secretKey) throw new Error('[stripe] secretKey is required')
    this.stripe = new Stripe(config.secretKey)
  }

  // ─── Checkout ─────────────────────────────────

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    if (params.priceId && params.customerId) {
      // Subscription billing
      const sessionParams: any = {
        customer: params.customerId,
        mode: 'subscription',
        line_items: [{ price: params.priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      }
      if (params.trialDays) sessionParams.subscription_data = { trial_period_days: params.trialDays }
      const session = await this.stripe.checkout.sessions.create(sessionParams)
      return { url: session.url, sessionId: session.id }
    }

    // One-time payment
    const currency = (params.currency ?? 'usd').toLowerCase()
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: params.description ?? `Order ${params.orderId}` },
          unit_amount: Math.round(params.amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { orderId: params.orderId, ...params.metadata },
    })
    return { url: session.url, sessionId: session.id }
  }

  // ─── Customers ────────────────────────────────

  async createCustomer(params: CustomerParams): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    })
    return customer.id
  }

  async getCustomer(customerId: string): Promise<Record<string, unknown>> {
    const c = await this.stripe.customers.retrieve(customerId)
    return c as unknown as Record<string, unknown>
  }

  async updateCustomer(customerId: string, params: Partial<CustomerParams>): Promise<Record<string, unknown>> {
    const c = await this.stripe.customers.update(customerId, {
      ...(params.name ? { name: params.name } : {}),
      ...(params.email ? { email: params.email } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })
    return c as unknown as Record<string, unknown>
  }

  // ─── Subscriptions ────────────────────────────

  async createSubscription(params: SubscriptionParams): Promise<SubscriptionResult> {
    const sub = await this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      trial_period_days: params.trialDays,
      metadata: params.metadata,
    })
    return {
      id: sub.id,
      status: sub.status,
      customerId: sub.customer as string,
      currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString(),
    }
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId)
    return {
      id: sub.id,
      status: sub.status,
      customerId: sub.customer as string,
      currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString(),
    }
  }

  async cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<void> {
    if (immediate) {
      await this.stripe.subscriptions.cancel(subscriptionId)
    } else {
      await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
    }
  }

  async changeSubscription(subscriptionId: string, newPriceId: string): Promise<SubscriptionResult> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId)
    const updated = await this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: sub.items.data[0].id, price: newPriceId }],
      proration_behavior: 'always_invoice',
    })
    return {
      id: updated.id,
      status: updated.status,
      customerId: updated.customer as string,
    }
  }

  async pauseSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'void' },
    })
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
    } as any)
  }

  // ─── Refunds ──────────────────────────────────

  async createRefund(params: RefundParams): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: params.paymentId,
      ...(params.amount ? { amount: Math.round(params.amount * 100) } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })
    return {
      id: refund.id,
      amount: (refund.amount ?? 0) / 100,
      status: refund.status ?? 'pending',
    }
  }

  // ─── Invoices ─────────────────────────────────

  async listInvoices(customerId: string, limit?: number): Promise<InvoiceResult[]> {
    const invoices = await this.stripe.invoices.list({ customer: customerId, limit: limit ?? 10 })
    return invoices.data.map(inv => ({
      id: inv.id,
      amount: (inv.amount_paid ?? 0) / 100,
      currency: inv.currency ?? 'usd',
      status: inv.status ?? 'draft',
      paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : undefined,
      pdfUrl: inv.invoice_pdf ?? undefined,
    }))
  }

  async getUpcomingInvoice(customerId: string): Promise<InvoiceResult | null> {
    try {
      const inv = await this.stripe.invoices.retrieveUpcoming({ customer: customerId })
      return {
        id: 'upcoming',
        amount: (inv.amount_due ?? 0) / 100,
        currency: inv.currency ?? 'usd',
        status: 'upcoming',
      }
    } catch {
      return null
    }
  }

  // ─── Portal ───────────────────────────────────

  async createPortal(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return { url: session.url }
  }

  // ─── Webhooks ─────────────────────────────────

  async verifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    if (!this.config.webhookSecret) throw new Error('[stripe] webhookSecret required for webhook verification')
    const event = this.stripe.webhooks.constructEvent(body, signature, this.config.webhookSecret)

    const typeMap: Record<string, string> = {
      'checkout.session.completed': 'payment.success',
      'customer.subscription.created': 'subscription.created',
      'customer.subscription.updated': 'subscription.updated',
      'customer.subscription.deleted': 'subscription.deleted',
      'invoice.paid': 'invoice.paid',
      'invoice.payment_failed': 'invoice.failed',
    }

    return {
      type: typeMap[event.type] ?? event.type,
      data: event.data.object as unknown as Record<string, unknown>,
      raw: event,
    }
  }
}

/**
 * Create a Stripe provider from environment variables.
 */
export function createStripeProvider(config?: Partial<StripeConfig>): StripeProvider {
  return new StripeProvider({
    secretKey: config?.secretKey ?? getEnv('STRIPE_SECRET_KEY', ''),
    webhookSecret: config?.webhookSecret ?? getEnv('STRIPE_WEBHOOK_SECRET'),
  })
}
