// @mostajs/payment — Payment Schema
// Author: Dr Hamid MADANI drmdh@msn.com
import type { EntitySchema } from '@mostajs/orm'

/**
 * Create a Payment schema with configurable options.
 *
 * @param options.currency   - Default currency (default: 'USD')
 * @param options.relationTarget - Related entity name (e.g. 'Reservation', 'Order')
 * @param options.relationRequired - Whether the relation is required
 * @param options.subscriptionTarget - Optional relation to Subscription entity
 * @param options.invoiceTarget - Optional relation to Invoice entity
 */
export function createPaymentSchema(options?: {
  currency?: string
  relationTarget?: string
  relationRequired?: boolean
  subscriptionTarget?: string
  invoiceTarget?: string
}): EntitySchema {
  const schema: EntitySchema = {
    name: 'Payment',
    collection: 'payments',
    timestamps: true,

    fields: {
      amount:         { type: 'number', required: true },
      currency:       { type: 'string', default: options?.currency ?? 'USD' },
      method:         { type: 'string', enum: ['card', 'transfer', 'cash', 'tpe'] },
      status:         { type: 'string', enum: ['pending', 'paid', 'refunded', 'failed'], default: 'pending' },
      transactionRef: { type: 'string' },
      paidAt:         { type: 'date' },
    },

    relations: {},

    indexes: [
      { fields: { status: 'asc' } },
    ],
  }

  if (options?.relationTarget) {
    const relKey = options.relationTarget.toLowerCase()
    schema.relations![relKey] = {
      target: options.relationTarget,
      type: 'many-to-one',
      required: options.relationRequired ?? false,
    }
    schema.indexes!.push({ fields: { [relKey]: 'asc' } })
  }

  if (options?.subscriptionTarget) {
    const relKey = options.subscriptionTarget.toLowerCase()
    schema.relations![relKey] = {
      target: options.subscriptionTarget,
      type: 'many-to-one',
      required: false,
    }
    schema.indexes!.push({ fields: { [relKey]: 'asc' } })
  }

  if (options?.invoiceTarget) {
    const relKey = options.invoiceTarget.toLowerCase()
    schema.relations![relKey] = {
      target: options.invoiceTarget,
      type: 'many-to-one',
      required: false,
    }
    schema.indexes!.push({ fields: { [relKey]: 'asc' } })
  }

  return schema
}

/** Default Payment schema (no relation, USD currency) */
export const PaymentSchema = createPaymentSchema()
