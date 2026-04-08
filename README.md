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

## License

MIT — (c) 2026 Dr Hamid MADANI <drmdh@msn.com>
