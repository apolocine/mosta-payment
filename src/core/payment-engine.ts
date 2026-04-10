// @mostajs/payment — Payment Engine (provider router)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { PaymentProvider } from './provider.interface.js'

const _providers = new Map<string, PaymentProvider>()
let _defaultProvider: string | null = null

/**
 * Register a payment provider.
 */
export function registerProvider(provider: PaymentProvider): void {
  _providers.set(provider.name, provider)
  if (!_defaultProvider) _defaultProvider = provider.name
}

/**
 * Set the default provider.
 */
export function setDefaultProvider(name: string): void {
  if (!_providers.has(name)) throw new Error(`[payment] Provider '${name}' not registered`)
  _defaultProvider = name
}

/**
 * Get a registered provider by name.
 */
export function getProvider(name?: string): PaymentProvider {
  const key = name ?? _defaultProvider
  if (!key) throw new Error('[payment] No provider registered')
  const p = _providers.get(key)
  if (!p) throw new Error(`[payment] Provider '${key}' not registered`)
  return p
}

/**
 * List registered provider names.
 */
export function listProviders(): string[] {
  return Array.from(_providers.keys())
}

/**
 * Get the best provider for a given currency.
 */
export function getProviderForCurrency(currency: string): PaymentProvider | null {
  for (const p of _providers.values()) {
    if (p.supportedCurrencies.includes('*') || p.supportedCurrencies.includes(currency.toUpperCase())) {
      return p
    }
  }
  return null
}

/**
 * Reset all providers (for testing).
 */
export function resetProviders(): void {
  _providers.clear()
  _defaultProvider = null
}
