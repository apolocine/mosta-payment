// @mostajs/payment — Server-side exports (ORM + Stripe dependent)
// Author: Dr Hamid MADANI drmdh@msn.com

// Stripe
export { createStripeClient, createCheckoutSession, handleWebhook } from './lib/stripe.js'

// Repository
export { getPaymentRepo, resetPaymentRepo } from './lib/payment-factory.js'

// API handlers
export { createCheckoutHandler } from './api/checkout.route.js'
export { createPaymentHandlers } from './api/payments.route.js'

// Module info
export { getSchemas, moduleInfo } from './lib/module-info.js'

// Registration
export { paymentModuleRegistration } from './register.js'
