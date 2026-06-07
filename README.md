# @mostajs/payment

> Payment module for @mostajs — Stripe checkout, multi-method (card, transfer, cash), multi-currency.

## Install

```bash
npm install @mostajs/payment stripe
```

## Usage

### Schema

```typescript
import { createPaymentSchema } from '@mostajs/payment'

// Default (no relation, USD)
const schema = createPaymentSchema()

// With relation to Reservation, DZD currency
const schema = createPaymentSchema({
  currency: 'DZD',
  relationTarget: 'Reservation',
  relationRequired: true,
})
```

### Stripe Checkout (server-side)

```typescript
import { createCheckoutHandler } from '@mostajs/payment/server'

const config = {
  currency: 'EUR',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  successUrlTemplate: '/confirmation/{orderId}?paid=true',
  cancelUrlTemplate: '/payment/{orderId}?cancelled=true',
}

// Next.js App Router
export const POST = createCheckoutHandler(config)
```

### Payment Page (React)

```tsx
import { PaymentPage } from '@mostajs/payment'

<PaymentPage
  orderId="12345"
  orderSummary={{
    title: 'Commande #12345',
    lines: [{ label: 'Article', value: '2x Widget' }],
    amount: 99.99,
    currency: 'EUR',
  }}
  config={{
    currency: 'EUR',
    stripePublicKey: process.env.NEXT_PUBLIC_STRIPE_KEY,
    successUrlTemplate: '/confirmation/{orderId}',
    cancelUrlTemplate: '/payment/{orderId}',
    methods: ['card', 'transfer'],
    bankInfo: { rib: 'FR76...', bankName: 'BNP', holder: 'SARL Example' },
  }}
  onSuccess={(method) => console.log('Paid via', method)}
/>
```

### Dialectes & orchestration (v0.6, server-side)

Chaque fournisseur est un **dialecte de paiement** (modèle calqué sur les
dialectes de `@mostajs/orm`). La couche d'orchestration crée le checkout chez le
bon dialecte **et persiste** la `Payment`, puis la règle au webhook — sans recopier
ce collage dans l'app.

```typescript
import {
  ensureProvidersFromEnv, createPaymentCheckout, settlePaymentFromWebhook,
} from '@mostajs/payment/server'

ensureProvidersFromEnv()   // enregistre les dialectes configurés dans .env (cascade MOSTA_ENV)

// 1) Créer un paiement (sélection du dialecte par devise : DZD → Chargily)
const { checkout, payment } = await createPaymentCheckout({
  dialect,                              // IDialect @mostajs/data-plug
  orderId: campaignId,
  amount: 50000, currency: 'DZD',       // unités de base (PAS centimes)
  successUrl, cancelUrl, webhookUrl,
  metadata: { campaignId, planSlug: 'gold' },
})
// → redirige l'utilisateur vers checkout.url ; payment.status === 'pending'

// 2) Webhook : régler la Payment + déclencher le métier
export async function POST(req: Request) {
  const s = await settlePaymentFromWebhook({
    dialect, providerName: 'chargily',
    body: await req.text(), headers: req.headers,
  })
  if (!s.ok) return Response.json({ error: s.reason }, { status: 400 })
  if (s.status === 'paid') {
    // activer la campagne sponsor (logique métier du consommateur)
  }
  return Response.json({ received: true })
}
```

Clés (y compris **clés de test** `sk_test_`/`test_sk_`) lues depuis le `.env` via
`@mostajs/config` — jamais en dur dans le code. Le `ManualProvider` permet de
confirmer un virement/cash hors-ligne (`POST { orderId, status:'paid' }`).

## API

| Export | Entry | Description |
|---|---|---|
| `PaymentSchema` | `.` | Default schema (no relation) |
| `createPaymentSchema(opts)` | `.` | Schema factory with options |
| `PaymentPage` | `.` | React payment UI component |
| `createStripeClient(config)` | `./server` | Stripe SDK wrapper |
| `createCheckoutSession(stripe, req, config)` | `./server` | Create Stripe session |
| `handleWebhook(stripe, body, sig, secret)` | `./server` | Verify webhook |
| `createCheckoutHandler(config)` | `./server` | Next.js checkout route |
| `createPaymentHandlers(dialect)` | `./server` | CRUD route handlers |
| `getPaymentRepo(dialect)` | `./server` | Payment repository |
| `AbstractPaymentProvider` | `./server` | Base de dialecte (v0.6) — étendue par les 5 providers |
| `createPaymentCheckout(input)` | `./server` | Checkout + persistance `Payment` (v0.6) |
| `settlePaymentFromWebhook(input)` | `./server` | Vérifie le webhook + règle la `Payment` (v0.6) |

## Environment

All provider factories read their secrets from environment variables as a
fallback when no explicit config is passed. This is the recommended setup
in production.

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal (REST v2)
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...
PAYPAL_TEST_MODE=false           # default: true unless literally 'false'
PAYPAL_RETURN_URL=/payment/success
PAYPAL_CANCEL_URL=/payment/canceled
PAYPAL_WEBHOOK_ID=...

# Chargily Pay V2 — Algeria (CIB + EDAHABIA)
CHARGILY_API_KEY=...
CHARGILY_TEST_MODE=false         # default: true unless literally 'false'
CHARGILY_SUCCESS_URL=/payment/success
CHARGILY_FAILURE_URL=/payment/failed
CHARGILY_WEBHOOK_URL=...

# Satim — Algeria (CIB, GIE Monetique)
SATIM_MERCHANT_ID=...
SATIM_PASSWORD=...
SATIM_TEST_MODE=true             # default: false unless literally 'true'
SATIM_RETURN_URL=/payment/callback
SATIM_FAIL_URL=/payment/failed
```

### Profile cascade with `MOSTA_ENV` (v0.4+)

Powered by [`@mostajs/config`](https://www.npmjs.com/package/@mostajs/config).
Keep one `.env` with profile-prefixed overrides à la
[Spring Boot profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html)
(`spring.profiles.active=test`) :

```bash
MOSTA_ENV=TEST

# Base defaults (used when no profile, or as fallback)
STRIPE_SECRET_KEY=sk_test_default
CHARGILY_API_KEY=test_default

# Profile overrides
TEST_STRIPE_SECRET_KEY=sk_test_xxx
TEST_CHARGILY_API_KEY=test_xxx

DEV_STRIPE_SECRET_KEY=sk_test_dev

PROD_STRIPE_SECRET_KEY=${VAULT_STRIPE}    # injected at runtime
PROD_CHARGILY_API_KEY=${VAULT_CHARGILY}
```

**Resolution cascade** (first non-empty value wins) :

1. Explicit `config` argument passed to `createStripeProvider(config)` / etc.
2. `${MOSTA_ENV}_${KEY}` — profile-prefixed env var
3. `${KEY}` — plain env var
4. Provider-specific default (empty string for required keys — the provider
   will raise a clear error at call time)

Missing profile overrides silently fall back to the plain variable — no
crash if the profiled key is absent. Empty strings are treated as "not
set" so they don't silently leak a blank secret to the provider SDK.

### Why this matters for payments

Provider secrets move through orchestrators (Vault, Scaleway Secrets,
Kubernetes Secrets, Doppler) in production. The cascade lets you keep
**one** committed `.env` with safe test defaults and have `PROD_*`
values injected at container startup. No more `.env.production` living
in a separate private repo. Users already using plain `STRIPE_SECRET_KEY`
etc. keep working unchanged — the cascade is fully backward-compatible.

## Changelog

### v0.4.1 — 2026-05-04 — Découplage `@mostajs/orm` via façade `data-plug` + WeakMap repo

Étape 3 du chantier *« system dialect séparé »* — applique deux fix qui se combinent.

#### 1. Migration `@mostajs/orm` → `@mostajs/data-plug` *(façade)*

Conformément au principe **« les modules @mostajs passent par data-plug, jamais hardcoder un dialect ou importer @mostajs/orm directement »**, `payment` ne dépend plus de `@mostajs/orm` en `peerDependency`. Tous les imports de production passent désormais par `@mostajs/data-plug v1.2.4` *(qui ré-exporte `BaseRepository`, `IDialect`, `EntitySchema`, …)*.

**4 fichiers migrés** :

| Fichier | Symboles |
|---------|----------|
| `src/api/payments.route.ts` | `IDialect` |
| `src/lib/module-info.ts` | `EntitySchema` |
| `src/lib/payment-factory.ts` | `BaseRepository` + `IDialect` |
| `src/schemas/payment.schema.ts` | `EntitySchema` |
| `package.json` | `peerDep` `orm` → `data-plug` |

`@mostajs/orm` reste en `devDependency` uniquement *(cohérence avec le `test-unit` qui pourrait l'instancier — sera revu plus tard)*.

#### 2. WeakMap dans `payment-factory.ts`

```ts
// Avant — capture la référence du PREMIER dialect, ignore les suivants
let cachedRepo: BaseRepository<PaymentDTO> | null = null

// Après — keyed par identité du dialect
const cache = new WeakMap<IDialect, BaseRepository<PaymentDTO>>()
```

Évite que le repo capture la référence du PREMIER dialect passé et ignore tous les suivants. Lorsque `/api/change-dialect` *(ou rotation système ↔ métier)* modifie le dialect courant, le cache miss force la reconstruction du repo avec la **nouvelle** instance dialect — au lieu de réutiliser un repo pointant vers une connexion morte.

`resetPaymentRepo()` conservé en no-op pour rétro-compat *(la WeakMap auto-libère naturellement les entrées dont le dialect n'est plus référencé)*.

#### Bump

`0.4.0 → 0.4.1` *(patch — découplage interne, signatures publiques inchangées)*.

---

### v0.4.0 — 2026-04-21

**Added** : all four provider factories (`createStripeProvider`,
`createPayPalProvider`, `createChargilyProvider`, `createSatimProvider`)
now resolve environment variables through
[`@mostajs/config`](https://www.npmjs.com/package/@mostajs/config). This
enables profile-based override cascade (`MOSTA_ENV=TEST` →
`TEST_STRIPE_SECRET_KEY` priority over plain `STRIPE_SECRET_KEY`), with
silent fallback when the profiled variant is absent. Matches Spring Boot
profile semantics (`spring.profiles.active=test`).

- `src/providers/stripe.provider.ts` : `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`
- `src/providers/paypal.provider.ts` : `PAYPAL_CLIENT_ID`,
  `PAYPAL_SECRET`, `PAYPAL_TEST_MODE`, `PAYPAL_RETURN_URL`,
  `PAYPAL_CANCEL_URL`, `PAYPAL_WEBHOOK_ID`
- `src/providers/chargily.provider.ts` : `CHARGILY_API_KEY`,
  `CHARGILY_TEST_MODE`, `CHARGILY_SUCCESS_URL`, `CHARGILY_FAILURE_URL`,
  `CHARGILY_WEBHOOK_URL`
- `src/providers/satim.provider.ts` : `SATIM_MERCHANT_ID`,
  `SATIM_PASSWORD`, `SATIM_TEST_MODE`, `SATIM_RETURN_URL`,
  `SATIM_FAIL_URL`
- `package.json` : add `@mostajs/config ^1.0.0` dependency, bump to
  `0.4.0`

Semantics preserved exactly : `CHARGILY_TEST_MODE !== 'false'` and
`SATIM_TEST_MODE === 'true'` defaults are unchanged (Chargily defaults to
test-on, Satim defaults to test-off).

## License

AGPL-3.0-or-later — (c) 2026 Dr Hamid MADANI <drmdh@msn.com>

Commercial license available : drmdh@msn.com
