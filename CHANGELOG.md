# Changelog — @mostajs/payment

**Auteur** : Dr Hamid MADANI <drmdh@msn.com>

Format [Keep a Changelog](https://keepachangelog.com/) · versionnage [SemVer](https://semver.org/).

## [0.7.0] — 2026-06-07 — Dialectes Algérie : SATIM durci + SlickPay + Guiddini

Vague 1 de l'état de l'art (`docs/01-ETUDE-ETAT-ART-PAYMENT-07062026.md`) — couvre
la demande banques & marchands DZ (D1/D4 de `02-OPPORTUNITES…`).
Conception : `docs/DESIGN-DIALECTES-DZ-SATIM-SLICKPAY-GUIDDINI.md`.

### Added
- **`SlickPayProvider`** / `createSlickPayProvider` — agrégateur DZ (CIB/EDAHABIA),
  auth clé publique, `POST /users/invoices` + `getInvoice` + `mapStatus`. Base/chemins
  pilotés par env (`SLICKPAY_*`).
- **`GuiddiniProvider`** / `createGuiddiniProvider` — agrégateur DZ certifié SATIM,
  auth `x-app-key`/`x-app-secret`, initiate + `getTransaction` + `mapStatus`. Env `GUIDDINI_*`.
- **SATIM durci** : `getOrderStatusExtended.do`, `SatimProvider.mapOrderStatus(code)`
  (codes BPC 0-6), `jsonParams` (metadata) au register ; `doVerifyWebhook` retourne
  **`orderId = OrderNumber`** (matching fiable) et supporte un statut JSON résolu (offline).
- Engine : `ProviderName` += `slickpay`|`guiddini` ; `KNOWN_PROVIDERS`,
  `getProviderByName`, `pickSignatureHeader`, `auto-register` (isConfigured/instantiate/ordre).
- Tests T10-T12 (héritage + mapping + câblage + settle via dialectes DZ, hors-ligne).
  Suite : **80/80**.

### Notes
- Rétro-compatible : aucun export retiré. DZD reste routé vers Chargily par défaut ;
  cibler SATIM/SlickPay/Guiddini via `providerName` (ou ordre/`setDefault` `.env`).
- Chemins SlickPay/Guiddini provisoires (docs publiques JS) — **pilotés par env**,
  à confirmer en certification GIE.

## [0.6.0] — 2026-06-07 — Modèle dialecte + orchestration checkout

Extension (DEVRULES §9 cas B) — le module est restructuré sur le **modèle des
dialectes de `@mostajs/orm`** : *un fournisseur = un dialecte de paiement*.
Conception : `docs/DESIGN-PAYMENT-DIALECTS-ORCHESTRATION.md`.

### Added
- **`AbstractPaymentProvider`** (`core/abstract-provider.ts`, export `/server`) —
  base abstraite calquée sur `AbstractSqlDialect` : méthodes *template* publiques
  `createCheckout`/`verifyWebhook` (validation `orderId`/`amount`, garde de devise,
  garantie `metadata.orderId`) déléguant aux *primitives* `protected abstract`
  `doCheckout`/`doVerifyWebhook`. Helper `supportsCurrency(c)`.
- **Orchestration** (`core/checkout-service.ts`, export `/server`) :
  - `createPaymentCheckout(input)` — sélectionne le dialecte (explicite > registre
    par devise > mapping devise), crée le checkout chez le fournisseur **et persiste**
    la ligne `Payment` (status `pending`, `provider`, `transactionRef`=sessionId,
    `orderId`, `metadata`). Équivalent paiement de `BaseRepository`/`createConnection`.
  - `settlePaymentFromWebhook(input)` — vérifie la signature, mappe l'event
    (`paid`/`failed`/`refunded`), retrouve la `Payment` par `orderId` et la met à
    jour (`paidAt` si payé). La logique métier post-paiement reste au consommateur.
  - Types `CreateCheckoutInput`/`CreateCheckoutOutput`/`SettleWebhookInput`/`SettleWebhookOutput`.
- Schéma `Payment` : 3 champs additifs `orderId` (indexé), `provider`, `metadata`
  (json) — auto-`ALTER TABLE ADD COLUMN` sur tables existantes (orm ≥ 2.5.4, #20).
  `PaymentDTO` gagne `provider?` et `metadata?`.
- `ManualProvider.doVerifyWebhook` : un POST `{ orderId, status:'paid' }` (ou
  `{ paid:true }`) émet un event de succès normalisé — confirmation manuelle
  (caissier/virement) testable hors-ligne.
- Tests T7 (base abstraite), T8 (orchestration create+settle via Manuel),
  T9 (settle via Chargily, signature HMAC réelle hors-ligne). Suite : **61/61**.

### Changed
- Les 5 providers (`Stripe`, `Chargily`, `Satim`, `PayPal`, `Manual`) **étendent
  désormais `AbstractPaymentProvider`** au lieu d'implémenter `PaymentProvider`
  directement. `createCheckout`/`verifyWebhook` publics deviennent les *templates*
  de la base ; les corps existants sont déplacés dans `doCheckout`/`doVerifyWebhook`
  (`protected`). **Aucun changement d'API publique** — exports, factories
  `create*Provider` et signatures inchangés (rétro-compatible).

### Notes
- Rétro-compatible 0.5.x : aucune signature publique retirée. Nouveaux exports
  uniquement sur `@mostajs/payment/server`.

## [0.5.4] — Auto-enregistrement des providers depuis l'environnement
- `registerProvidersFromEnv` / `ensureProvidersFromEnv` / `resetEnsuredProviders`.

## [0.5.0] — Webhook helpers provider-agnostiques
- `handleProviderWebhook`, `isPaidEvent`/`isFailedEvent`/`isRefundedEvent`,
  `extractOrderId`, `pickProviderByCurrency`, `CURRENCY_TO_PROVIDER`.

## [0.4.1] — Découplage `@mostajs/orm` via façade `data-plug` + WeakMap repo

## [0.4.0] — Résolution env via `@mostajs/config` (cascade `MOSTA_ENV`)
