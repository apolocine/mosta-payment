// @mostajs/payment — PaymentPage component
// Generalized from booking-baloon /payment/[id]/page.tsx
// Author: Dr Hamid MADANI drmdh@msn.com
'use client'

import { useState } from 'react'
import type { OrderSummary, PaymentMethodType, PaymentConfig } from '../types/index.js'

interface PaymentPageProps {
  /** Unique order identifier */
  orderId: string
  /** Order summary to display */
  orderSummary: OrderSummary
  /** Payment configuration */
  config: PaymentConfig
  /** Callback on successful payment initiation */
  onSuccess?: (method: PaymentMethodType, transactionRef?: string) => void
  /** Callback to go back */
  onBack?: () => void
  /** Checkout API endpoint (default: '/api/checkout') */
  checkoutApiPath?: string
}

export function PaymentPage({
  orderId,
  orderSummary,
  config,
  onSuccess,
  onBack,
  checkoutApiPath = '/api/checkout',
}: PaymentPageProps) {
  const [method, setMethod] = useState<PaymentMethodType>('card')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  const methods = config.methods ?? ['card', 'transfer', 'cash']

  const METHOD_LABELS: Record<PaymentMethodType, { label: string; icon: string; desc: string }> = {
    card:     { label: 'Carte bancaire', icon: '💳', desc: 'Paiement securise via Stripe' },
    transfer: { label: 'Virement bancaire', icon: '🏦', desc: 'Virement vers notre compte' },
    cash:     { label: 'Especes sur place', icon: '💵', desc: 'Paiement a la reception' },
    tpe:      { label: 'Terminal de paiement', icon: '📱', desc: 'Paiement par TPE' },
  }

  async function handlePay() {
    setProcessing(true)
    try {
      if (method === 'card') {
        const res = await fetch(checkoutApiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            lineItems: [{ name: orderSummary.title, unitAmount: orderSummary.amount, quantity: 1 }],
            currency: orderSummary.currency,
          }),
        })
        const data = await res.json() as { url?: string }
        if (data.url) {
          globalThis.location.href = data.url
          return
        }
      }

      // For non-card methods, mark as success immediately
      setSuccess(true)
      onSuccess?.(method)
    } catch (err) {
      console.error('[payment] Error:', err)
    } finally {
      setProcessing(false)
    }
  }

  if (success) {
    return (
      <div style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ marginBottom: 8 }}>Paiement enregistre</h2>
        <p style={{ color: '#6b7280' }}>
          {method === 'transfer' && 'Votre virement sera verifie sous 24-48h.'}
          {method === 'cash' && 'Veuillez payer sur place lors de votre visite.'}
          {method === 'tpe' && 'Paiement par terminal enregistre.'}
        </p>
        {onBack && <button onClick={onBack} style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}>Retour</button>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>Paiement</h1>

      {/* Order summary */}
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{orderSummary.title}</h3>
        {orderSummary.lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
            <span>{line.label}</span>
            <span>{line.value}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8, fontWeight: 'bold', fontSize: 18 }}>
          Total : {orderSummary.amount} {orderSummary.currency}
        </div>
      </div>

      {/* Payment method selection */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Mode de paiement</h3>
        {methods.map(m => {
          const info = METHOD_LABELS[m]
          if (!info) return null
          return (
            <label key={m} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8,
              border: `2px solid ${method === m ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: 8, cursor: 'pointer', background: method === m ? '#eff6ff' : '#fff',
            }}>
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              <span style={{ fontSize: 24 }}>{info.icon}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{info.label}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{info.desc}</div>
              </div>
            </label>
          )
        })}
      </div>

      {/* Bank transfer details */}
      {method === 'transfer' && config.bankInfo && (
        <div style={{ background: '#fefce8', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 14 }}>
          <h4 style={{ fontWeight: 600, marginBottom: 8 }}>Coordonnees bancaires</h4>
          <div>RIB : <strong>{config.bankInfo.rib}</strong></div>
          <div>Banque : {config.bankInfo.bankName}</div>
          <div>Titulaire : {config.bankInfo.holder}</div>
          <div style={{ marginTop: 8, color: '#92400e' }}>
            Mentionnez la reference <strong>{orderId}</strong> dans le motif du virement.
          </div>
        </div>
      )}

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={processing || (method === 'card' && !config.stripePublicKey)}
        style={{
          width: '100%', padding: '12px 0', fontSize: 16, fontWeight: 'bold', color: '#fff',
          background: processing ? '#9ca3af' : '#3b82f6', border: 'none', borderRadius: 8, cursor: 'pointer',
        }}
      >
        {processing ? 'Traitement en cours...' : method === 'card' ? `Payer ${orderSummary.amount} ${orderSummary.currency}` : 'Confirmer'}
      </button>

      {method === 'card' && !config.stripePublicKey && (
        <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
          Stripe non configure — definissez stripePublicKey dans la config.
        </p>
      )}
    </div>
  )
}
