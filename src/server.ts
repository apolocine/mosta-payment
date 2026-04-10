// @mostajs/payment v0.3 — Server-side exports
// Author: Dr Hamid MADANI drmdh@msn.com

// ─── Core ───────────────────────────────────────
export type {
  PaymentProvider, CheckoutParams, CheckoutResult, CustomerParams,
  SubscriptionParams, SubscriptionResult, RefundParams, RefundResult,
  InvoiceResult, WebhookEvent,
} from './core/provider.interface.js'

export {
  registerProvider, setDefaultProvider, getProvider,
  listProviders, getProviderForCurrency, resetProviders,
} from './core/payment-engine.js'

// ─── Providers ──────────────────────────────────
export { SatimProvider, createSatimProvider } from './providers/satim.provider.js'
export type { SatimConfig } from './providers/satim.provider.js'

export { ChargilyProvider, createChargilyProvider } from './providers/chargily.provider.js'
export type { ChargilyConfig } from './providers/chargily.provider.js'

export { PayPalProvider, createPayPalProvider } from './providers/paypal.provider.js'
export type { PayPalConfig } from './providers/paypal.provider.js'

export { StripeProvider, createStripeProvider } from './providers/stripe.provider.js'
export type { StripeConfig } from './providers/stripe.provider.js'

export { ManualProvider, createManualProvider } from './providers/manual.provider.js'
export type { ManualConfig } from './providers/manual.provider.js'

// ─── Legacy Stripe functions (backward compat) ─
export {
  createStripeClient, createCheckoutSession, handleWebhook,
  createBillingSession, createPortalSession, handleBillingWebhook,
} from './lib/stripe.js'
export type { WebhookHandlers } from './lib/stripe.js'

// ─── Repository ─────────────────────────────────
export { getPaymentRepo, resetPaymentRepo } from './lib/payment-factory.js'

// ─── API handlers ───────────────────────────────
export { createCheckoutHandler } from './api/checkout.route.js'
export { createPaymentHandlers } from './api/payments.route.js'

// ─── Module info ────────────────────────────────
export { getSchemas, moduleInfo } from './lib/module-info.js'
export { paymentModuleRegistration } from './register.js'
