// @mostajs/payment — Payment module for @mostajs
// Stripe checkout, multi-method, multi-currency
// Author: Dr Hamid MADANI drmdh@msn.com

// Types (client-safe)
export type {
  PaymentConfig,
  PaymentStatus,
  PaymentMethodType,
  LineItem,
  CheckoutRequest,
  CheckoutResult,
  OrderSummary,
  PaymentDTO,
} from './types/index.js'

// Stripe types (client-safe)
export type { WebhookHandlers } from './lib/stripe.js'

// Schema
export { PaymentSchema, createPaymentSchema } from './schemas/payment.schema.js'

// Components
export { PaymentPage } from './components/PaymentPage.js'

// Module info
export { moduleInfo } from './lib/module-info.js'
