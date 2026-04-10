// @mostajs/payment — PaymentProvider interface (contrat commun)
// Author: Dr Hamid MADANI drmdh@msn.com

export interface CheckoutParams {
  orderId: string
  amount: number
  currency?: string
  description?: string
  successUrl: string
  cancelUrl: string
  webhookUrl?: string
  metadata?: Record<string, string>
  /** For subscription billing */
  customerId?: string
  priceId?: string
  trialDays?: number
}

export interface CheckoutResult {
  url: string | null
  sessionId: string
}

export interface CustomerParams {
  email: string
  name: string
  metadata?: Record<string, string>
}

export interface SubscriptionParams {
  customerId: string
  priceId: string
  trialDays?: number
  metadata?: Record<string, string>
}

export interface SubscriptionResult {
  id: string
  status: string
  customerId: string
  currentPeriodEnd?: string
}

export interface RefundParams {
  paymentId: string
  amount?: number
  reason?: string
  metadata?: Record<string, string>
}

export interface RefundResult {
  id: string
  amount: number
  status: string
}

export interface InvoiceResult {
  id: string
  amount: number
  currency: string
  status: string
  paidAt?: string
  pdfUrl?: string
}

export interface WebhookEvent {
  type: string
  data: Record<string, unknown>
  raw?: unknown
}

/**
 * PaymentProvider — contract for all payment providers.
 * Implemented by: Satim, PayPal, Chargily, Stripe, Manual
 */
export interface PaymentProvider {
  readonly name: string
  readonly supportedCurrencies: string[]
  readonly supportedMethods: string[]

  /** Create a checkout session (redirect user to payment page) */
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>

  /** Verify and parse a webhook payload */
  verifyWebhook(body: string, signature: string): Promise<WebhookEvent>

  /** Create a customer (optional — not all providers support) */
  createCustomer?(params: CustomerParams): Promise<string>

  /** Get customer details */
  getCustomer?(customerId: string): Promise<Record<string, unknown>>

  /** Update customer */
  updateCustomer?(customerId: string, params: Partial<CustomerParams>): Promise<Record<string, unknown>>

  /** Create a subscription */
  createSubscription?(params: SubscriptionParams): Promise<SubscriptionResult>

  /** Get subscription details */
  getSubscription?(subscriptionId: string): Promise<SubscriptionResult>

  /** Cancel a subscription */
  cancelSubscription?(subscriptionId: string, immediate?: boolean): Promise<void>

  /** Change subscription plan */
  changeSubscription?(subscriptionId: string, newPriceId: string): Promise<SubscriptionResult>

  /** Pause subscription */
  pauseSubscription?(subscriptionId: string): Promise<void>

  /** Resume subscription */
  resumeSubscription?(subscriptionId: string): Promise<void>

  /** Create a refund */
  createRefund?(params: RefundParams): Promise<RefundResult>

  /** List invoices for a customer */
  listInvoices?(customerId: string, limit?: number): Promise<InvoiceResult[]>

  /** Get upcoming invoice */
  getUpcomingInvoice?(customerId: string): Promise<InvoiceResult | null>

  /** Create a billing portal session (self-service) */
  createPortal?(customerId: string, returnUrl: string): Promise<{ url: string }>
}
