// @mostajs/payment — Types
// Author: Dr Hamid MADANI drmdh@msn.com

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
export type PaymentMethodType = 'card' | 'transfer' | 'cash' | 'tpe'

export interface PaymentConfig {
  /** Default currency code (e.g. 'USD', 'EUR', 'DZD') */
  currency: string
  /** Fallback currency (used when no currency in request) */
  defaultCurrency?: string
  /** Stripe secret key (server-side only) */
  stripeSecretKey?: string
  /** Stripe public key (client-side) */
  stripePublicKey?: string
  /** Stripe webhook signing secret */
  stripeWebhookSecret?: string
  /** URL template for successful payment — {orderId} is replaced */
  successUrlTemplate: string
  /** URL template for cancelled payment — {orderId} is replaced */
  cancelUrlTemplate: string
  /** Available payment methods */
  methods?: PaymentMethodType[]
  /** Bank transfer details (for transfer method) */
  bankInfo?: {
    rib: string
    bankName: string
    holder: string
  }
}

export interface LineItem {
  /** Product/service name */
  name: string
  /** Optional description */
  description?: string
  /** Unit amount in currency base units (NOT cents — conversion is handled internally) */
  unitAmount: number
  /** Quantity */
  quantity: number
}

export interface CheckoutRequest {
  /** Unique order/reservation identifier */
  orderId: string
  /** Items to pay for */
  lineItems: LineItem[]
  /** Override default currency */
  currency?: string
  /** Override return URL */
  returnUrl?: string
  /** Additional metadata for Stripe */
  metadata?: Record<string, string>
}

export interface CheckoutResult {
  /** Stripe checkout URL (redirect user here) */
  url: string | null
  /** Stripe session ID */
  sessionId: string
}

export interface OrderSummary {
  /** Display title (e.g. "Reservation #12345") */
  title: string
  /** Description lines */
  lines: { label: string; value: string }[]
  /** Total amount */
  amount: number
  /** Currency code */
  currency: string
}

export interface PaymentDTO {
  id: string
  amount: number
  currency: string
  method: PaymentMethodType
  status: PaymentStatus
  transactionRef?: string
  paidAt?: Date
  orderId?: string
}
