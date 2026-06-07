// @mostajs/payment — AbstractPaymentProvider (base de dialecte de paiement)
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Calqué sur le modèle des dialectes de @mostajs/orm (`AbstractSqlDialect`) :
//   IDialect            → PaymentProvider          (le contrat)
//   AbstractSqlDialect  → AbstractPaymentProvider  (base : orchestration + primitives abstraites)
//   SqliteDialect…      → StripeProvider / ChargilyProvider / …  (un fournisseur = un dialecte)
//   getDialect/registry → payment-engine (register/get/forCurrency)
//
// La base factorise la logique partagée (validation, garantie metadata.orderId,
// garde de devise) en *méthodes template* publiques `createCheckout`/`verifyWebhook`,
// et délègue les spécificités fournisseur aux *primitives* `protected abstract`
// `doCheckout`/`doVerifyWebhook` — exactement comme `AbstractSqlDialect` expose
// `create`/`update` et délègue à `doExecuteRun`/`doExecuteQuery`.

import type {
  PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent,
} from './provider.interface.js'

/**
 * Base abstraite des dialectes de paiement. Chaque fournisseur
 * (Stripe, Chargily, Satim, PayPal, Manual) l'étend et n'implémente
 * que ses primitives.
 */
export abstract class AbstractPaymentProvider implements PaymentProvider {
  // ── Identité du dialecte (à déclarer par chaque fournisseur) ──
  abstract readonly name: string
  abstract readonly supportedCurrencies: string[]
  abstract readonly supportedMethods: string[]

  // ── Méthode template : créer un checkout ──
  // Valide, normalise (garantit metadata.orderId pour le matching webhook),
  // puis délègue au dialecte concret.
  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    this.assertValidCheckout(params)
    const normalized: CheckoutParams = {
      ...params,
      metadata: { orderId: params.orderId, ...(params.metadata ?? {}) },
    }
    return this.doCheckout(normalized)
  }

  // ── Méthode template : vérifier/parser un webhook ──
  async verifyWebhook(body: string, signature: string): Promise<WebhookEvent> {
    return this.doVerifyWebhook(body, signature)
  }

  // ── Primitives (spécifiques au dialecte) ──
  /** Crée la session de paiement chez le fournisseur (appel API / redirection). */
  protected abstract doCheckout(params: CheckoutParams): Promise<CheckoutResult>
  /** Vérifie la signature et normalise l'event reçu du fournisseur. */
  protected abstract doVerifyWebhook(body: string, signature: string): Promise<WebhookEvent>

  // ── Helpers partagés ──
  /** Vrai si ce dialecte gère la devise (joker '*' inclus). */
  supportsCurrency(currency: string | null | undefined): boolean {
    const c = String(currency ?? '').toUpperCase()
    return this.supportedCurrencies.includes('*') || this.supportedCurrencies.includes(c)
  }

  /** Garde commune : orderId présent, montant > 0, devise supportée. */
  protected assertValidCheckout(params: CheckoutParams): void {
    if (!params.orderId) throw new Error(`[${this.name}] orderId is required`)
    if (!(params.amount > 0)) throw new Error(`[${this.name}] amount must be > 0`)
    if (params.currency && !this.supportsCurrency(params.currency)) {
      throw new Error(
        `[${this.name}] currency '${params.currency}' not supported ` +
        `(supported: ${this.supportedCurrencies.join(', ')})`,
      )
    }
  }
}
