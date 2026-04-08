// @mostajs/payment — Tests unitaires (SQLite :memory:)
// Author: Dr Hamid MADANI drmdh@msn.com

import { createIsolatedDialect, registerSchemas, clearRegistry } from '@mostajs/orm'
import type { EntitySchema } from '@mostajs/orm'
import { createPaymentSchema, PaymentSchema } from '../src/schemas/payment.schema.js'
import { moduleInfo, getSchemas } from '../src/lib/module-info.js'
import { createStripeClient } from '../src/lib/stripe.js'
import { createCheckoutHandler } from '../src/api/checkout.route.js'
import { getPaymentRepo, resetPaymentRepo } from '../src/lib/payment-factory.js'
import type { PaymentConfig } from '../src/types/index.js'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log('  ✅', label) }
  else { failed++; console.error('  ❌', label) }
}

async function run() {
  // ── T1 — Schema factory ──
  console.log('T1 — Schema factory')

  const s1 = createPaymentSchema()
  assert(s1.name === 'Payment', 'default: name === Payment')
  assert(s1.collection === 'payments', 'default: collection === payments')
  assert(Object.keys(s1.fields).length === 6, 'default: 6 fields')
  assert(Object.keys(s1.relations!).length === 0, 'default: no relations')
  assert(s1.fields.currency.default === 'USD', 'default: currency USD')

  const s2 = createPaymentSchema({ currency: 'EUR' })
  assert(s2.fields.currency.default === 'EUR', 'EUR override works')

  const s3 = createPaymentSchema({
    relationTarget: 'Order',
    subscriptionTarget: 'Subscription',
    invoiceTarget: 'Invoice',
  })
  assert(s3.relations!.order !== undefined, 'relation order exists')
  assert(s3.relations!.order.type === 'many-to-one', 'order: many-to-one')
  assert(s3.relations!.order.target === 'Order', 'order: target Order')
  assert(s3.relations!.subscription !== undefined, 'relation subscription exists')
  assert(s3.relations!.subscription.type === 'many-to-one', 'subscription: many-to-one')
  assert(s3.relations!.subscription.target === 'Subscription', 'subscription: target Subscription')
  assert(s3.relations!.subscription.required === false, 'subscription: not required')
  assert(s3.relations!.invoice !== undefined, 'relation invoice exists')
  assert(s3.relations!.invoice.type === 'many-to-one', 'invoice: many-to-one')
  assert(s3.relations!.invoice.target === 'Invoice', 'invoice: target Invoice')
  assert(s3.relations!.invoice.required === false, 'invoice: not required')
  assert(Object.keys(s3.relations!).length === 3, '3 relations total')
  console.log('')

  // ── T2 — PaymentConfig type ──
  console.log('T2 — PaymentConfig type (defaultCurrency)')
  const cfg: PaymentConfig = {
    currency: 'USD',
    defaultCurrency: 'EUR',
    successUrlTemplate: '/success/{orderId}',
    cancelUrlTemplate: '/cancel/{orderId}',
  }
  assert(cfg.defaultCurrency === 'EUR', 'defaultCurrency field exists and is EUR')
  assert(cfg.currency === 'USD', 'currency field still works')
  console.log('')

  // ── T3 — Module info ──
  console.log('T3 — Module info')
  assert(moduleInfo.name === 'payment', 'moduleInfo.name === payment')
  assert(moduleInfo.version === '0.2.0', 'moduleInfo.version === 0.2.0')
  assert(getSchemas().length === 1, 'getSchemas() → 1 schema')
  assert(getSchemas()[0].name === 'Payment', 'getSchemas()[0].name === Payment')
  console.log('')

  // ── T4 — CRUD payments (SQLite :memory:) ──
  console.log('T4 — CRUD payments')
  clearRegistry()
  registerSchemas([PaymentSchema])

  const dialect = await createIsolatedDialect(
    { dialect: 'sqlite', uri: ':memory:', schemaStrategy: 'create' },
    [PaymentSchema],
  )

  resetPaymentRepo()
  const repo = getPaymentRepo(dialect)

  // Create
  const p1 = await repo.create({
    amount: 100,
    currency: 'USD',
    method: 'card',
    status: 'pending',
    transactionRef: 'tx_001',
  } as any)
  assert((p1 as any).id !== undefined, 'created payment has id')
  assert((p1 as any).amount === 100, 'amount = 100')
  assert((p1 as any).currency === 'USD', 'currency = USD')

  const p2 = await repo.create({
    amount: 250,
    currency: 'EUR',
    method: 'transfer',
    status: 'paid',
  } as any)

  // findAll
  const all = await repo.findAll()
  assert(all.length === 2, 'findAll → 2 payments')

  // findById
  const found = await repo.findById((p1 as any).id)
  assert(found !== null, 'findById → found')
  assert((found as any).transactionRef === 'tx_001', 'findById → correct transactionRef')
  console.log('')

  // ── T5 — Stripe guard ──
  console.log('T5 — Stripe guard')
  try {
    createStripeClient({ currency: 'USD', successUrlTemplate: '', cancelUrlTemplate: '' })
    failed++; console.error('  ❌ createStripeClient without key should throw')
  } catch (e: any) {
    assert(e.message.includes('stripeSecretKey'), 'throw stripeSecretKey required')
  }

  const handler = createCheckoutHandler({
    currency: 'USD',
    stripeSecretKey: 'sk_test_fake',
    successUrlTemplate: '/success/{orderId}',
    cancelUrlTemplate: '/cancel/{orderId}',
  })
  assert(typeof handler === 'function', 'createCheckoutHandler returns a function')
  console.log('')

  // ── Cleanup ──
  await dialect.disconnect()
  clearRegistry()
  resetPaymentRepo()

  // ── Summary ──
  console.log('════════════════════════════════════════')
  console.log(`  Resultats: ${passed} passed, ${failed} failed`)
  console.log('════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
