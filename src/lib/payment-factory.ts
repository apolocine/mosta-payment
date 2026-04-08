// @mostajs/payment — Payment repository factory
// Author: Dr Hamid MADANI drmdh@msn.com
import { BaseRepository } from '@mostajs/orm'
import type { IDialect } from '@mostajs/orm'
import type { PaymentDTO } from '../types/index.js'
import { PaymentSchema } from '../schemas/payment.schema.js'

let cachedRepo: BaseRepository<PaymentDTO> | null = null

/**
 * Get or create the Payment repository.
 */
export function getPaymentRepo(dialect: IDialect): BaseRepository<PaymentDTO> {
  if (!cachedRepo) {
    cachedRepo = new BaseRepository<PaymentDTO>(PaymentSchema, dialect)
  }
  return cachedRepo
}

/**
 * Reset cache (for testing or dialect change).
 */
export function resetPaymentRepo(): void {
  cachedRepo = null
}
