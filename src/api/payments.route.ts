// @mostajs/payment — Payment CRUD API route handlers
// Author: Dr Hamid MADANI drmdh@msn.com
import type { IDialect } from '@mostajs/orm'
import type { PaymentDTO } from '../types/index.js'
import { getPaymentRepo } from '../lib/payment-factory.js'

/**
 * Create payment CRUD handlers (Next.js App Router).
 */
export function createPaymentHandlers(dialect: IDialect) {
  const repo = getPaymentRepo(dialect)

  async function GET(): Promise<Response> {
    try {
      const payments = await repo.findAll()
      return Response.json(payments)
    } catch (err) {
      return Response.json({ error: 'Failed to fetch payments' }, { status: 500 })
    }
  }

  async function POST(req: Request): Promise<Response> {
    try {
      const data = await req.json() as Record<string, unknown>
      const payment = await repo.create(data as Partial<PaymentDTO>)
      return Response.json(payment, { status: 201 })
    } catch (err) {
      return Response.json({ error: 'Failed to create payment' }, { status: 500 })
    }
  }

  return { GET, POST }
}
