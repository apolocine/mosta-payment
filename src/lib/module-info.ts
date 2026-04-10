// @mostajs/payment — Module info
// Author: Dr Hamid MADANI drmdh@msn.com
import { PaymentSchema } from '../schemas/payment.schema.js'
import type { EntitySchema } from '@mostajs/orm'

export function getSchemas(): EntitySchema[] {
  return [PaymentSchema]
}

export const moduleInfo = {
  name: 'payment',
  label: 'Payment',
  description: 'Payment processing — Stripe, bank transfer, cash',
  version: '0.3.0',
  schemas: ['Payment'],
}
