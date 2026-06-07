// @mostajs/payment — Auto-enregistrement des providers depuis l'environnement
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Factorise le boilerplate « enregistrer Stripe/Chargily/Satim/PayPal/Manual
// selon les variables d'env présentes » que chaque application réécrivait.
// Idempotent : un provider déjà enregistré n'est pas réenregistré (sauf force).
//
// Ordre d'enregistrement = ordre de résolution par devise (cf.
// getProviderForCurrency, scan linéaire) : les providers à devise SPÉCIFIQUE
// (Chargily/Satim → DZD) sont enregistrés AVANT Stripe (joker '*') pour que
// DZD route vers Chargily et non Stripe. `manual` (joker '*') n'est enregistré
// que s'il est explicitement demandé, pour éviter qu'il ne capte toutes les
// devises.

import { getEnv } from '@mostajs/config'
import {
  registerProvider, setDefaultProvider, getProvider, listProviders,
} from './payment-engine.js'
import { createStripeProvider } from '../providers/stripe.provider.js'
import { createChargilyProvider } from '../providers/chargily.provider.js'
import { createSatimProvider } from '../providers/satim.provider.js'
import { createPayPalProvider } from '../providers/paypal.provider.js'
import { createManualProvider } from '../providers/manual.provider.js'
import type { ProviderName } from '../lib/webhook-helpers.js'

export interface AutoRegisterOptions {
  /**
   * Sous-ensemble (et ORDRE) de providers à considérer.
   * Défaut : ['chargily', 'satim', 'paypal', 'stripe'] — `manual` exclu
   * sauf s'il est listé ici explicitement.
   */
  providers?: ProviderName[]
  /** Provider par défaut après enregistrement. Défaut : 'stripe' si présent, sinon le 1er. */
  setDefault?: ProviderName
  /** Réenregistre même si déjà présent. Défaut : false (idempotent). */
  force?: boolean
}

/** Indique si l'environnement contient de quoi instancier ce provider. */
function isConfigured(name: ProviderName): boolean {
  switch (name) {
    case 'stripe':   return !!getEnv('STRIPE_SECRET_KEY')
    case 'chargily': return !!(getEnv('CHARGILY_SECRET_KEY') ?? getEnv('CHARGILY_API_KEY'))
    case 'satim':    return !!getEnv('SATIM_MERCHANT_ID')
    case 'paypal':   return !!getEnv('PAYPAL_CLIENT_ID')
    case 'manual':   return true // aucun secret requis
    default:         return false
  }
}

function instantiate(name: ProviderName) {
  switch (name) {
    case 'stripe':   return createStripeProvider()
    case 'chargily': return createChargilyProvider()
    case 'satim':    return createSatimProvider()
    case 'paypal':   return createPayPalProvider()
    case 'manual':   return createManualProvider()
    default:         return null
  }
}

const DEFAULT_ORDER: ProviderName[] = ['chargily', 'satim', 'paypal', 'stripe']

/**
 * Enregistre dans le registre les providers configurés via l'environnement
 * (cascade `MOSTA_ENV` de `@mostajs/config`). Retourne la liste des noms
 * effectivement enregistrés par cet appel.
 *
 * @example
 * import { registerProvidersFromEnv, getProviderForCurrency } from '@mostajs/payment/server'
 * registerProvidersFromEnv()                 // Stripe + Chargily si env présents
 * const p = getProviderForCurrency('DZD')    // → Chargily
 */
export function registerProvidersFromEnv(opts: AutoRegisterOptions = {}): string[] {
  const order = opts.providers ?? DEFAULT_ORDER
  const already = new Set(listProviders())
  const registered: string[] = []

  for (const name of order) {
    if (!opts.force && already.has(name)) continue
    if (!isConfigured(name)) continue
    const provider = instantiate(name)
    if (!provider) continue
    registerProvider(provider)
    registered.push(name)
  }

  // Provider par défaut.
  const names = listProviders()
  const wanted = opts.setDefault ?? (names.includes('stripe') ? 'stripe' : names[0] as ProviderName | undefined)
  if (wanted && names.includes(wanted)) setDefaultProvider(wanted)

  return registered
}

/**
 * Variante idempotente « best-effort » : enregistre les providers depuis
 * l'env une seule fois, et renvoie le registre courant. Pratique en tête
 * de route handler (App Router) sans se soucier des appels répétés.
 */
let _ensured = false
export function ensureProvidersFromEnv(opts: AutoRegisterOptions = {}): string[] {
  if (!_ensured) {
    registerProvidersFromEnv(opts)
    _ensured = true
  }
  return listProviders()
}

/** Réinitialise le verrou de `ensureProvidersFromEnv` (tests). */
export function resetEnsuredProviders(): void { _ensured = false }
