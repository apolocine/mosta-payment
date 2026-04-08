# @mostajs/payment — Plan de tests
// Author: Dr Hamid MADANI drmdh@msn.com
// Date: 2026-04-07

---

## 1. Tests unitaires (sans Stripe, sans SGBD)

### T1 — Schema
- [ ] `createPaymentSchema()` → name 'Payment', collection 'payments', 6 fields, no relations
- [ ] `createPaymentSchema({ currency: 'DZD' })` → field currency default 'DZD'
- [ ] `createPaymentSchema({ relationTarget: 'Reservation', relationRequired: true })` → relation many-to-one required
- [ ] `createPaymentSchema({ relationTarget: 'Order' })` → relation key 'order', not required
- [ ] `PaymentSchema` (default export) → no relation, currency 'USD'

### T2 — Types coherence
- [ ] PaymentConfig contient : currency, stripeSecretKey, stripePublicKey, successUrlTemplate, cancelUrlTemplate
- [ ] LineItem contient : name, unitAmount, quantity
- [ ] CheckoutRequest contient : orderId, lineItems
- [ ] PaymentDTO contient : id, amount, currency, method, status

### T3 — Module info
- [ ] `moduleInfo.name` === 'payment'
- [ ] `getSchemas()` retourne 1 schema (Payment)

### T4 — Payment factory
- [ ] `getPaymentRepo(dialect)` retourne un BaseRepository
- [ ] `resetPaymentRepo()` + `getPaymentRepo()` retourne nouvelle instance

---

## 2. Tests Stripe (mock ou cle test)

### T5 — Stripe client
- [ ] `createStripeClient({ stripeSecretKey: 'sk_test_...' })` → retourne Stripe instance
- [ ] `createStripeClient({})` → throw 'stripeSecretKey is required'

### T6 — Checkout session (avec cle test Stripe)
- [ ] `createCheckoutSession(stripe, { orderId: '123', lineItems: [{name:'X', unitAmount:10, quantity:1}] }, config)` → retourne { url, sessionId }
- [ ] URL contient checkout.stripe.com
- [ ] unitAmount 10 → Stripe recoit 1000 (×100 pour cents)

### T7 — Checkout handler (API route)
- [ ] `createCheckoutHandler(config)` retourne une fonction POST
- [ ] POST avec body vide → 400 'orderId and lineItems are required'
- [ ] POST avec body valide + cle test → 200 { url, sessionId }

---

## 3. Tests d'integration (SQLite + CRUD)

### T8 — Payment CRUD
- [ ] `createPaymentHandlers(dialect)` retourne { GET, POST }
- [ ] POST create payment → 201
- [ ] GET list payments → array contenant le payment cree
- [ ] Payment a les bons champs (amount, currency, method, status)

---

## 4. Tests composant (React)

### T9 — PaymentPage render
- [ ] Render avec config minimale → affiche titre, montant, methodes
- [ ] Methode 'card' selectionnee par defaut
- [ ] Click 'transfer' → affiche coordonnees bancaires si bankInfo present
- [ ] stripePublicKey absent + methode card → message d'avertissement

---

## 5. Matrice de couverture

| Test | Type | Script |
|---|---|---|
| T1-T4 | Unitaire | test-unit.sh |
| T5-T7 | Stripe | test-stripe.sh (necessite STRIPE_SECRET_KEY) |
| T8 | Integration | test-crud-sqlite.sh |
| T9 | Composant | test-component.sh (necessite jsdom) |
