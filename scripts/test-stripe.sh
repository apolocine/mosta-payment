#!/bin/bash
# @mostajs/payment — Tests Stripe (avec cles de test)
# Author: Dr Hamid MADANI drmdh@msn.com
# Usage: bash scripts/test-stripe.sh
# Les cles sont les cles de test Stripe du compte booking-baloon
set -e

cd "$(dirname "$0")/.."
echo ""
echo "════════════════════════════════════════"
echo "  @mostajs/payment — Tests Stripe"
echo "════════════════════════════════════════"
echo ""

# Cles de test Stripe — definir via variables d'environnement ou fichier .env.test
# Ex: STRIPE_PUBLIC_KEY=pk_test_... STRIPE_SECRET_KEY=sk_test_... bash scripts/test-stripe.sh
if [ -z "$STRIPE_SECRET_KEY" ]; then
  # Essayer de charger depuis booking-baloon/.env.local
  ENV_FILE="$(dirname "$0")/../../../../booking-baloon/frontend/.env.local"
  if [ -f "$ENV_FILE" ]; then
    export STRIPE_PUBLIC_KEY=$(grep NEXT_PUBLIC_STRIPE_KEY "$ENV_FILE" | cut -d= -f2)
    export STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY" "$ENV_FILE" | cut -d= -f2)
  else
    echo "❌ STRIPE_SECRET_KEY non defini et $ENV_FILE introuvable"
    echo "   Usage: STRIPE_SECRET_KEY=sk_test_... bash scripts/test-stripe.sh"
    exit 1
  fi
fi

echo "▶ Stripe public key: ${STRIPE_PUBLIC_KEY:0:20}..."
echo "▶ Stripe secret key: ${STRIPE_SECRET_KEY:0:20}..."
echo ""

echo "▶ Build..."
npx tsc 2>&1
echo "  ✅ Build OK"
echo ""

npx tsx -e "
import { createStripeClient, createCheckoutSession } from './src/lib/stripe.js'
import { createCheckoutHandler } from './src/api/checkout.route.js'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) { passed++; console.log('  ✅', label) }
  else { failed++; console.error('  ❌', label) }
}

const config = {
  currency: 'EUR',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripePublicKey: process.env.STRIPE_PUBLIC_KEY,
  successUrlTemplate: 'https://example.com/success/{orderId}',
  cancelUrlTemplate: 'https://example.com/cancel/{orderId}',
}

async function run() {
  // ── T5 — Stripe client ──
  console.log('T5 — createStripeClient')
  const stripe = createStripeClient(config)
  assert(stripe !== null, 'Stripe instance created')
  assert(typeof stripe.checkout === 'object', 'stripe.checkout exists')
  console.log('')

  // ── T6 — Checkout session ──
  console.log('T6 — createCheckoutSession')
  try {
    const result = await createCheckoutSession(stripe, {
      orderId: 'test-' + Date.now(),
      lineItems: [
        { name: 'Test Product', description: 'Test description', unitAmount: 19.99, quantity: 2 },
      ],
      currency: 'EUR',
    }, config)

    assert(result.sessionId !== undefined, 'sessionId returned')
    assert(result.sessionId.startsWith('cs_test_'), 'sessionId starts with cs_test_')
    assert(result.url !== null, 'url returned')
    assert(result.url.includes('checkout.stripe.com'), 'url contains checkout.stripe.com')
    console.log('  Session ID:', result.sessionId.slice(0, 30) + '...')
    console.log('  URL:', result.url?.slice(0, 50) + '...')
  } catch (e) {
    failed++; console.error('  ❌ createCheckoutSession failed:', e.message)
  }
  console.log('')

  // ── T6b — Unit amount conversion ──
  console.log('T6b — Unit amount conversion (cents)')
  try {
    const result = await createCheckoutSession(stripe, {
      orderId: 'cents-test-' + Date.now(),
      lineItems: [{ name: 'Widget', unitAmount: 10, quantity: 1 }],
    }, config)
    assert(result.sessionId.startsWith('cs_test_'), '10 EUR → 1000 cents → session OK')
  } catch (e) {
    failed++; console.error('  ❌ cents conversion failed:', e.message)
  }
  console.log('')

  // ── T7 — Checkout handler (API route) ──
  console.log('T7 — createCheckoutHandler')
  const handler = createCheckoutHandler(config)
  assert(typeof handler === 'function', 'handler is a function')

  // Test with empty body → 400
  const emptyReq = new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  })
  const emptyRes = await handler(emptyReq)
  assert(emptyRes.status === 400, 'empty body → 400')
  const emptyBody = await emptyRes.json()
  assert(emptyBody.error.includes('orderId'), 'error mentions orderId')

  // Test with valid body → 200
  const validReq = new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify({
      orderId: 'handler-test-' + Date.now(),
      lineItems: [{ name: 'Test via handler', unitAmount: 5, quantity: 1 }],
    }),
    headers: { 'Content-Type': 'application/json' },
  })
  const validRes = await handler(validReq)
  assert(validRes.status === 200, 'valid body → 200')
  const validBody = await validRes.json()
  assert(validBody.sessionId?.startsWith('cs_test_'), 'response has sessionId')
  assert(validBody.url?.includes('stripe'), 'response has Stripe url')
  console.log('')

  // ── Summary ──
  console.log('════════════════════════════════════════')
  console.log('  Resultats: ' + passed + ' passed, ' + failed + ' failed')
  console.log('════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
"
