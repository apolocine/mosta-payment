// @mostajs/payment — Payment repository factory
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Cache keyed par identité du dialect (WeakMap) — un changement de dialect
// (ex: /api/change-dialect côté serveur, ou rotation système↔métier) produit
// un cache miss et une reconstruction. Évite le bug où le repo capturait
// la référence du PREMIER dialect passé et ignorait tous les suivants — ce
// qui conduisait à "PostgreSQL not connected. Call connect() first." après
// disconnect d'une connexion qui restait quand même cached dans le repo.
import { BaseRepository } from '@mostajs/data-plug'
import type { IDialect } from '@mostajs/data-plug'
import type { PaymentDTO } from '../types/index.js'
import { PaymentSchema } from '../schemas/payment.schema.js'

const cache = new WeakMap<IDialect, BaseRepository<PaymentDTO>>()

/**
 * Get or create the Payment repository for a given dialect.
 * Cache keyed par identité du dialect (WeakMap) — auto-reconstruction sur
 * changement de dialect.
 */
export function getPaymentRepo(dialect: IDialect): BaseRepository<PaymentDTO> {
  let r = cache.get(dialect)
  if (!r) {
    r = new BaseRepository<PaymentDTO>(PaymentSchema, dialect)
    cache.set(dialect, r)
  }
  return r
}

/**
 * No-op préservé pour rétro-compat — la WeakMap libère naturellement les
 * entrées dont le dialect n'est plus référencé.
 */
export function resetPaymentRepo(): void {
  // Auto-cleanup via WeakMap : intentional no-op.
}
