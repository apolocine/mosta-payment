// @mostajs/payment — Tests unitaires
// Author: Dr Hamid MADANI drmdh@msn.com
import { createPaymentSchema, PaymentSchema } from '../src/schemas/payment.schema.js'
import { moduleInfo, getSchemas } from '../src/lib/module-info.js'
import { createStripeClient } from '../src/lib/stripe.js'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log('  ✅', label) }
  else { failed++; console.error('  ❌', label) }
}

// ── T1 — Schema ──
console.log('T1 — createPaymentSchema')

const s1 = createPaymentSchema()
assert(s1.name === 'Payment', 'name === Payment')
assert(s1.collection === 'payments', 'collection === payments')
assert(Object.keys(s1.fields).length === 6, '6 fields')
assert(Object.keys(s1.relations!).length === 0, 'no relations (default)')
assert(s1.fields.currency.default === 'USD', 'currency default USD')

const s2 = createPaymentSchema({ currency: 'DZD' })
assert(s2.fields.currency.default === 'DZD', 'currency DZD override')

const s3 = createPaymentSchema({ relationTarget: 'Reservation', relationRequired: true })
assert(s3.relations!.reservation !== undefined, 'relation reservation exists')
assert(s3.relations!.reservation.type === 'many-to-one', 'relation type many-to-one')
assert(s3.relations!.reservation.required === true, 'relation required')
assert(s3.relations!.reservation.target === 'Reservation', 'relation target Reservation')

const s4 = createPaymentSchema({ relationTarget: 'Order' })
assert(s4.relations!.order !== undefined, 'relation key order (lowercase)')
assert(s4.relations!.order.required === false, 'relation not required by default')

assert(PaymentSchema.name === 'Payment', 'PaymentSchema default export OK')
assert(Object.keys(PaymentSchema.relations!).length === 0, 'PaymentSchema no relations')
console.log('')

// ── T3 — Module info ──
console.log('T3 — Module info')
assert(moduleInfo.name === 'payment', 'moduleInfo.name === payment')
assert(moduleInfo.version === '0.1.0', 'moduleInfo.version === 0.1.0')
assert(getSchemas().length === 1, 'getSchemas() → 1 schema')
assert(getSchemas()[0].name === 'Payment', 'getSchemas()[0].name === Payment')
console.log('')

// ── T5 — Stripe client guard ──
console.log('T5 — Stripe client guard')
try {
  createStripeClient({ currency: 'USD', successUrlTemplate: '', cancelUrlTemplate: '' })
  failed++; console.error('  ❌ createStripeClient without key should throw')
} catch (e: any) {
  assert(e.message.includes('stripeSecretKey'), 'throw stripeSecretKey required')
}
console.log('')

// ── Summary ──
console.log('════════════════════════════════════════')
console.log(`  Resultats: ${passed} passed, ${failed} failed`)
console.log('════════════════════════════════════════')
if (failed > 0) process.exit(1)
