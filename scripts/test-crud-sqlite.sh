#!/bin/bash
# @mostajs/payment — Test CRUD avec SQLite :memory:
# Author: Dr Hamid MADANI drmdh@msn.com
# Usage: bash scripts/test-crud-sqlite.sh
set -e

cd "$(dirname "$0")/.."
echo ""
echo "════════════════════════════════════════"
echo "  @mostajs/payment — Test CRUD SQLite"
echo "════════════════════════════════════════"
echo ""

echo "▶ Build..."
npx tsc 2>&1
echo "  ✅ Build OK"
echo ""

npx tsx -e "
import { createConnection, disconnectDialect, registerSchemas } from '@mostajs/orm'
import { createPaymentSchema } from './src/schemas/payment.schema.js'
import { getPaymentRepo, resetPaymentRepo } from './src/lib/payment-factory.js'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) { passed++; console.log('  ✅', label) }
  else { failed++; console.error('  ❌', label) }
}

async function run() {
  // Setup
  const schema = createPaymentSchema({ currency: 'DZD' })
  registerSchemas([schema])
  const dialect = await createConnection({
    dialect: 'sqlite',
    uri: ':memory:',
    schemaStrategy: 'create',
  })

  // ── T8 — Payment CRUD ──
  console.log('T8 — Payment CRUD (SQLite)')

  const repo = getPaymentRepo(dialect)
  assert(repo !== null, 'getPaymentRepo → not null')

  // Create
  const payment = await repo.create({
    amount: 1500,
    currency: 'DZD',
    method: 'card',
    status: 'pending',
    transactionRef: 'cs_test_abc123',
  })
  assert(payment.id !== undefined, 'create → id generated')
  assert(payment.amount === 1500, 'create → amount 1500')
  assert(payment.currency === 'DZD', 'create → currency DZD')
  assert(payment.method === 'card', 'create → method card')
  assert(payment.status === 'pending', 'create → status pending')
  console.log('  Payment ID:', payment.id)

  // Create second
  await repo.create({ amount: 500, currency: 'DZD', method: 'cash', status: 'paid' })

  // FindAll
  const all = await repo.findAll()
  assert(all.length === 2, 'findAll → 2 payments')

  // FindOne
  const found = await repo.findOne({ method: 'cash' })
  assert(found !== null, 'findOne cash → found')
  assert(found?.amount === 500, 'findOne cash → amount 500')

  // Update
  const updated = await repo.update(payment.id, { status: 'paid', paidAt: new Date() })
  assert(updated?.status === 'paid', 'update → status paid')

  // Count
  const count = await repo.count()
  assert(count === 2, 'count → 2')

  const paidCount = await repo.count({ status: 'paid' })
  assert(paidCount === 2, 'count paid → 2')

  // Delete
  const deleted = await repo.delete(payment.id)
  assert(deleted === true, 'delete → true')

  const afterDelete = await repo.count()
  assert(afterDelete === 1, 'count after delete → 1')

  console.log('')

  // Cleanup
  resetPaymentRepo()
  await disconnectDialect()

  // ── Summary ──
  console.log('════════════════════════════════════════')
  console.log('  Resultats: ' + passed + ' passed, ' + failed + ' failed')
  console.log('════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
"
