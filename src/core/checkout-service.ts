// @mostajs/payment — Orchestration checkout ↔ persistance ↔ règlement webhook
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Couche d'orchestration au-dessus des dialectes de paiement — l'équivalent
// de `BaseRepository` / `createConnection` de @mostajs/orm, qui *utilise* un
// dialecte sans le réimplémenter :
//
//   createPaymentCheckout()      → sélectionne le dialecte (registre/devise),
//                                  crée le checkout chez le fournisseur, ET
//                                  persiste une ligne Payment (status 'pending').
//   settlePaymentFromWebhook()   → vérifie le webhook, mappe l'event vers un
//                                  statut, retrouve la Payment par orderId et
//                                  la met à jour (paid/failed/refunded).
//
// La logique métier post-paiement (activer une campagne, marquer une
// inscription, …) reste au consommateur, qui lit le résultat retourné.

import type { IDialect } from '@mostajs/data-plug'
import type { PaymentProvider, CheckoutResult, WebhookEvent } from './provider.interface.js'
import type { PaymentDTO, PaymentMethodType, PaymentStatus } from '../types/index.js'
import { getProvider, getProviderForCurrency } from './payment-engine.js'
import { getPaymentRepo } from '../lib/payment-factory.js'
import {
  handleProviderWebhook, isPaidEvent, isFailedEvent, isRefundedEvent,
  extractOrderId, pickProviderByCurrency, getProviderByName, isKnownProvider,
} from '../lib/webhook-helpers.js'
import type { ProviderName } from '../lib/webhook-helpers.js'

// ─── createPaymentCheckout ────────────────────────────────────────────

export interface CreateCheckoutInput {
  /** Dialecte de persistance (data-plug/orm) où écrire la ligne Payment. */
  dialect: IDialect
  /** Identifiant d'ordre — clé de matching avec le webhook. */
  orderId: string
  /** Montant en unités de base de la devise (PAS en centimes). */
  amount: number
  /** Code ISO 4217 (ex: 'DZD', 'EUR'). */
  currency: string
  description?: string
  successUrl: string
  cancelUrl: string
  webhookUrl?: string
  /** Méthode persistée sur la ligne Payment (défaut 'card'). */
  method?: PaymentMethodType
  /** Contexte métier propagé au provider et restitué au webhook. */
  metadata?: Record<string, string>
  /** Force un dialecte ; sinon résolu par devise (registre → mapping devise). */
  providerName?: ProviderName | string
}

export interface CreateCheckoutOutput {
  payment: PaymentDTO
  checkout: CheckoutResult
  /** Nom du dialecte effectivement utilisé. */
  provider: string
}

/** Résout le dialecte : explicite > registre-par-devise > mapping devise (instancié env). */
function resolveProvider(input: CreateCheckoutInput): PaymentProvider {
  if (input.providerName) {
    try { return getProvider(input.providerName) }
    catch {
      if (isKnownProvider(input.providerName)) return getProviderByName(input.providerName)
      throw new Error(`[payment] Provider '${input.providerName}' not registered and not a known provider`)
    }
  }
  const byReg = getProviderForCurrency(input.currency)
  if (byReg) return byReg
  return pickProviderByCurrency(input.currency).provider
}

/**
 * Crée un checkout chez le bon dialecte ET persiste la Payment (pending).
 *
 * @example
 *   const { payment, checkout } = await createPaymentCheckout({
 *     dialect, orderId, amount: 50000, currency: 'DZD',
 *     successUrl, cancelUrl, webhookUrl,
 *     metadata: { campaignId, planSlug },
 *   })
 *   redirect(checkout.url)   // si non null
 */
export async function createPaymentCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
  const provider = resolveProvider(input)
  const metadata: Record<string, string> = { ...(input.metadata ?? {}), orderId: input.orderId }

  const checkout = await provider.createCheckout({
    orderId: input.orderId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    webhookUrl: input.webhookUrl,
    metadata,
  })

  const repo = getPaymentRepo(input.dialect)
  const payment = await repo.create({
    orderId: input.orderId,
    amount: input.amount,
    currency: input.currency,
    method: input.method ?? 'card',
    status: 'pending',
    provider: provider.name,
    transactionRef: checkout.sessionId,
    metadata,
  } as Partial<PaymentDTO>)

  return { payment, checkout, provider: provider.name }
}

// ─── settlePaymentFromWebhook ─────────────────────────────────────────

export interface SettleWebhookInput {
  /** Dialecte de persistance où retrouver/mettre à jour la Payment. */
  dialect: IDialect
  /** Nom du dialecte émetteur du webhook. */
  providerName: ProviderName
  /** Corps brut de la requête (req.text() — signature calculée dessus). */
  body: string
  /** Headers HTTP de la requête. */
  headers: Headers | Record<string, string>
}

export interface SettleWebhookOutput {
  /** false si signature invalide / payload malformé / provider inconnu. */
  ok: boolean
  reason?: string
  event?: WebhookEvent
  orderId?: string | null
  /** Statut déduit de l'event (undefined si event neutre). */
  status?: PaymentStatus
  /** Payment mise à jour (null si introuvable ou statut non terminal). */
  payment?: PaymentDTO | null
}

/**
 * Vérifie le webhook, en déduit un statut, et règle la Payment correspondante.
 * Le consommateur lit le retour pour exécuter sa logique métier
 * (ex: activer la campagne sponsor) si `status === 'paid'`.
 */
export async function settlePaymentFromWebhook(input: SettleWebhookInput): Promise<SettleWebhookOutput> {
  const res = await handleProviderWebhook({
    body: input.body, headers: input.headers, providerName: input.providerName,
  })
  if (!res.ok) return { ok: false, reason: `${res.reason}: ${res.error}` }

  const event = res.event
  const orderId = extractOrderId(event)

  let status: PaymentStatus | undefined
  if (isPaidEvent(event)) status = 'paid'
  else if (isRefundedEvent(event)) status = 'refunded'
  else if (isFailedEvent(event)) status = 'failed'

  let payment: PaymentDTO | null = null
  if (orderId && status) {
    const repo = getPaymentRepo(input.dialect)
    const existing = await repo.findOne({ orderId } as Record<string, unknown>)
    if (existing) {
      payment = await repo.update((existing as PaymentDTO).id, {
        status,
        ...(status === 'paid' ? { paidAt: new Date() } : {}),
      } as Partial<PaymentDTO>)
    }
  }

  return { ok: true, event, orderId, status, payment }
}
