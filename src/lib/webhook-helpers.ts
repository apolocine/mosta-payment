// @mostajs/payment — Webhook helpers (provider-agnostic) — v0.5.0+
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Mutualise le code de vérification signature + normalisation event
// type entre les apps consumers (octonet-cloud, iquesta, etc.).
// Chaque app garde sa logique métier (Subscription / Registration / …)
// dans son route handler, mais la vérif HMAC et le mapping
// event-type sont centralisés ici.

import { createChargilyProvider } from '../providers/chargily.provider.js'
import { createStripeProvider } from '../providers/stripe.provider.js'
import { createSatimProvider } from '../providers/satim.provider.js'
import { createPayPalProvider } from '../providers/paypal.provider.js'
import { createManualProvider } from '../providers/manual.provider.js'
import type { PaymentProvider, WebhookEvent } from '../core/provider.interface.js'

export type ProviderName = 'chargily' | 'stripe' | 'satim' | 'paypal' | 'manual'

/** Liste exhaustive des noms de provider supportés. À étendre dans ce
 *  module quand un nouveau provider est ajouté → tous les consumers
 *  bénéficient automatiquement. */
export const KNOWN_PROVIDERS: readonly ProviderName[] = ['chargily', 'stripe', 'satim', 'paypal', 'manual']

/** Type-guard runtime — vrai si `name` est un ProviderName valide. */
export function isKnownProvider(name: string): name is ProviderName {
  return (KNOWN_PROVIDERS as readonly string[]).includes(name)
}

// ─── Provider selection by currency ───────────────────────────────────

/**
 * Mapping currency → provider par défaut. Couvre les principaux cas :
 * DZD → Chargily *(Algérie)*, autres → Stripe *(international)*.
 * Pour CIB-only Algérie sans Chargily, override en caller via le
 * paramètre `fallback` de `pickProviderByCurrency`.
 */
export const CURRENCY_TO_PROVIDER: Readonly<Record<string, ProviderName>> = Object.freeze({
  DZD: 'chargily',
  EUR: 'stripe',
  USD: 'stripe',
  GBP: 'stripe',
  CHF: 'stripe',
  CAD: 'stripe',
})

/**
 * Choisit le provider à utiliser pour une currency donnée.
 *
 * @param currency  Code ISO 4217 (insensible à la casse)
 * @param fallback  Provider à utiliser si la currency n'est pas mappée (default 'stripe')
 */
export function pickProviderByCurrency(
  currency: string | null | undefined,
  fallback: ProviderName = 'stripe',
): { name: ProviderName; provider: PaymentProvider } {
  const c = String(currency ?? '').toUpperCase()
  const name = CURRENCY_TO_PROVIDER[c] ?? fallback
  return { name, provider: getProviderByName(name) }
}

// ─── Signature header selection ───────────────────────────────────────

/**
 * Sélectionne le header signature attendu pour chaque provider.
 * Headers normalisés en lowercase (Headers.get est case-insensitive).
 */
export function pickSignatureHeader(headers: Headers | Record<string, string>, providerName: ProviderName): string {
  const get = (key: string): string => {
    if (headers instanceof Headers) return headers.get(key) ?? ''
    return headers[key] ?? headers[key.toLowerCase()] ?? ''
  }
  switch (providerName) {
    case 'chargily':
      // Chargily envoie `signature` (header officiel docs) ;
      // certains proxies passent `chargily-signature` (legacy).
      return get('chargily-signature') || get('signature') || ''
    case 'stripe':
      return get('stripe-signature') || ''
    case 'satim':
      return get('x-satim-signature') || get('signature') || ''
    case 'paypal':
      // PayPal utilise plusieurs headers ; le caller doit traiter à part.
      return get('paypal-transmission-sig') || ''
    case 'manual':
      return get('x-signature') || ''
    default:
      return ''
  }
}

/**
 * Instancie un PaymentProvider à partir de son nom (lit env via le constructor).
 * Utile pour le webhook handler qui n'a pas besoin de connaître la config.
 */
export function getProviderByName(name: ProviderName): PaymentProvider {
  switch (name) {
    case 'chargily': return createChargilyProvider()
    case 'stripe':   return createStripeProvider()
    case 'satim':    return createSatimProvider()
    case 'paypal':   return createPayPalProvider()
    case 'manual':   return createManualProvider()
  }
}

export interface HandleProviderWebhookArgs {
  /** Body brut de la requête (req.text() avant parse). Crucial : signature
   *  computed sur les bytes exacts envoyés par le provider. */
  body: string
  /** Headers de la requête HTTP. */
  headers: Headers | Record<string, string>
  /** Nom du provider. */
  providerName: ProviderName
}

export type HandleProviderWebhookResult =
  | { ok: true; event: WebhookEvent }
  | { ok: false; reason: 'bad_signature' | 'malformed' | 'unknown_provider'; error: string }

/**
 * Vérifie le webhook reçu d'un provider de paiement et retourne l'event
 * normalisé. La logique métier (créer une Subscription, marquer une
 * Registration, etc.) reste à la charge du caller.
 *
 * @example
 *   const r = await handleProviderWebhook({
 *     body: await req.text(),
 *     headers: req.headers,
 *     providerName: 'chargily',
 *   })
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
 *   if (isPaidEvent(r.event)) {
 *     // ... mettre à jour DB métier ...
 *   }
 */
export async function handleProviderWebhook(args: HandleProviderWebhookArgs): Promise<HandleProviderWebhookResult> {
  let provider: PaymentProvider
  try {
    provider = getProviderByName(args.providerName)
  } catch (e: any) {
    return { ok: false, reason: 'unknown_provider', error: e?.message ?? String(e) }
  }
  const signature = pickSignatureHeader(args.headers, args.providerName)
  try {
    const event = await provider.verifyWebhook(args.body, signature)
    return { ok: true, event }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    if (/signature/i.test(msg)) return { ok: false, reason: 'bad_signature', error: msg }
    return { ok: false, reason: 'malformed', error: msg }
  }
}

// ─── Event type normalization ─────────────────────────────────────────

/**
 * Vrai si l'event indique un paiement réussi, peu importe le provider.
 * Couvre les variantes de naming entre Chargily / Stripe / Satim / PayPal.
 */
export function isPaidEvent(event: WebhookEvent): boolean {
  const t = String(event?.type ?? '')
  return t === 'payment.success'                 // Chargily, Satim
      || t === 'checkout.paid'                    // legacy alias
      || t === 'checkout.session.completed'       // Stripe Checkout
      || t === 'payment_intent.succeeded'         // Stripe PaymentIntent
      || t === 'PAYMENT.CAPTURE.COMPLETED'        // PayPal
}

/** Vrai si l'event indique un échec ou une annulation de paiement. */
export function isFailedEvent(event: WebhookEvent): boolean {
  const t = String(event?.type ?? '')
  return t === 'payment.failed'
      || t === 'payment.canceled'
      || t === 'checkout.failed'
      || t === 'checkout.session.expired'
      || t === 'payment_intent.payment_failed'
      || t === 'PAYMENT.CAPTURE.DENIED'
      || t === 'PAYMENT.CAPTURE.REFUNDED'
}

/** Vrai si l'event indique un remboursement. */
export function isRefundedEvent(event: WebhookEvent): boolean {
  const t = String(event?.type ?? '')
  return t === 'payment.refunded'
      || t === 'charge.refunded'
      || t === 'PAYMENT.CAPTURE.REFUNDED'
}

/**
 * Extrait l'`orderId` (= clef de matching côté app, ex: registrationId)
 * depuis le payload event, peu importe le provider. Cherche dans plusieurs
 * positions usuelles.
 */
export function extractOrderId(event: WebhookEvent): string | null {
  const data: any = event?.data ?? {}
  return String(
    data?.metadata?.orderId
    ?? data?.metadata?.registrationId
    ?? data?.orderId
    ?? data?.client_reference_id
    ?? '',
  ) || null
}
