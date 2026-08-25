# Mauritius Payment Automation Options — Rs 500 Booking Deposits

Status: research + architecture only, nothing built or contracted. This is now the main payment-strategy reference for the agency (no prior `docs/mips-mcb-juice-payment-feasibility.md` existed in this repo to reconcile with — this document starts that reference). Phase 1 production provider remains unchanged: `MANUAL_JUICE_TRANSFER` (customer sends MUR 500 to Juice number **5902 8505**, sends a WhatsApp screenshot, owner manually checks her account and confirms). Nothing in this document changes that today.

Research method: four parallel research passes against official sources only (MCB, MIPS, Bank of Mauritius, provider documentation) on 2026-08-25, cross-checked against each other. Every figure below is either sourced with a URL or explicitly marked `UNKNOWN`, `REQUIRES QUOTE`, or `NOT PUBLIC` — nothing here is invented. Where sources disagree or a claim is only partially confirmed, that's flagged rather than smoothed over.

---

## 1. Options investigated

### Option A — Manual Juice Transfer (current, Phase 1 baseline)
Customer sends MUR 500 to `5902 8505` via personal Juice → sends a WhatsApp screenshot → owner manually checks her account/statement → owner manually confirms. Direct monetary cost: Rs 0. Real cost is staff time and mismatch risk (see §4). No API, no reference, no automation possible beyond what already exists (the deposit-request drafting this prototype already does).

### Option B1 — MCB Juice Merchant (static QR)
A merchant-tier QR product distinct from personal Juice — [mcb.mu/sme/campaign/juice-merchant](https://mcb.mu/sme/campaign/juice-merchant). "No setup costs, no equipment needed." The QR encodes only the merchant's outlet name, phone number and account number — **no per-transaction data** — [MCB Juice FAQ](https://mcb.mu/docs/juicelibraries/default-document-library/juice-documents/-view-juice-frequently-asked-questions.pdf?sfvrsn=b68305f5_2). The customer scans and **types the amount themselves**, same as today. Fees: **0% promotional, 2 March–30 June 2026; normal fee thereafter is NOT PUBLIC.** A richer corporate tier ("Mobile Banking") adds a sales dashboard, SMS confirmations and Excel export — [mcb.mu/corporate/payment-cash/collect/mobile-banking](https://mcb.mu/corporate/payment-cash/collect/mobile-banking) — but it's **UNKNOWN** whether the free SME tier includes this or only JuicePro's basic history. No API, no webhook, no confirmed reference field anywhere in MCB's public material.

### Option B2 — MCB Juice online, via Peach Payments
MCB Group's own announced partnership brings Juice into **online/e-commerce checkout via Peach Payments** (a South African PSP) — [mcbgroup.com: e-commerce partnership with Peach Payments for MCB Juice](https://mcbgroup.com/news/article/ecommerce-partnership-with-peach-payments-for-mcb-juice). This is a genuinely different product from B1: it's a standard hosted-checkout integration (API/webhook-based, like any PSP), not a static QR. Peach publishes an actual SME rate: **1.50% + MUR 3.50 per transaction** — [peachpayments.com/mcb-juice](https://www.peachpayments.com/mcb-juice). This is the only fully public per-transaction fee found for any Juice-compatible automated option in this research.

### MauCAS QR (Bank of Mauritius national instant-payment scheme) — surfaced during research, directly relevant to the "Dynamic QR" question
MauCAS is BOM's own interoperable payment-switch infrastructure, "fully owned and operated by the Bank of Mauritius" — [bom.mu/maucas-0](https://www.bom.mu/maucas-0). MCB Juice, SBM Tag, Pop and others ride on top of it as participant apps; it's broader than and distinct from MCB Juice specifically. Peach Payments' MauCAS integration page states it generates **"a unique code per transaction"** specifically to reduce fraud/duplicate-payment risk — [peachpayments.com/pay-with/maucas](https://www.peachpayments.com/pay-with/maucas/). This is the **single clearest confirmation of dynamic, per-transaction QR found anywhere in this research** — stronger than anything MCB's own Juice Merchant material claims. BOM itself does not appear to onboard merchants directly or publish merchant pricing/API terms; access is via a participating bank or PSP (MCB, Peach, etc.) — cost and exact merchant-facing API are `UNKNOWN`.

### Option C — MIPS QuickPay / Payment Links
MIPS (mips.mu) publishes a named, lighter-weight product tier distinct from full e-commerce integration: **QuickPay** — generate a payment link/QR shareable by email, SMS, WhatsApp, with **no website required** — [mips.mu/quickpay](https://mips.mu/quickpay), also listed as "Payment Links & Embedded Buttons" — [mips.mu/e-commerce-solutions](https://mips.mu/e-commerce-solutions/). Confirmed to support **Juice, card, MyT Money and Blink** in the same checkout — [mips.mu/payment_gateway.php](https://mips.mu/payment_gateway.php). Claims ERP sync "for instant payment updates (special conditions apply)," implying a webhook-like mechanism exists commercially, but the exact API contract and whether a structured order/reference-ID field exists per link is **not confirmed from public content** — `docs.mips.mu` exists as a developer portal but its content wasn't inspectable in this pass. Pricing: **Essential tier ≈ Rs 1,000–1,400/month** depending on 24/12/1-month commitment — [mips.mu/pricing](https://mips.mu/pricing/) — **per-transaction fee is REQUIRES QUOTE.**

### Option C2 — MIPS full e-commerce/API integration
The heavier tier of the same MIPS platform — full API integration rather than a link product. Same Juice/card/MyT Money/Blink support, presumably fuller API/webhook access, **Pro tier ≈ Rs 1,650–2,200/month** — [mips.mu/pricing](https://mips.mu/pricing/). Per-transaction fee still **REQUIRES QUOTE**.

### Option D — MCB E-commerce Gateway
Important finding: **MCB's own online payment gateway is not MIPS.** It's built on **Mastercard Payment Gateway Services (MPGS)** — "Developed and hosted by Mastercard" — [mcb.mu/corporate/.../online-payment-gateway](https://mcb.mu/corporate/payment-cash/collect/e-commerce/online-payment-gateway). This is a **cards/Apple Pay** product; it does not carry Juice (that's the separate Peach partnership, Option B2). For Méhua specifically this is a poor fit: the discovery interview shows Juice as the customers' overwhelmingly dominant payment method, with no card usage recorded. Onboarding documentation references a "Certificate of Incorporation," suggesting this product leans toward registered companies rather than sole traders — [mcb.mu/sme/pay/electronic-payments/e-commerce-solutions](https://mcb.mu/sme/pay/electronic-payments/e-commerce-solutions). Fees: **NOT PUBLIC.**

### Option E — Payment links / secure invoicing
This is answered by Option C above: **MIPS QuickPay is Mauritius's clearly-documented "generate and send a payment link" product**, distinct from a full gateway build. No separate, cheaper "secure mail invoicing" product distinct from QuickPay was found from any Mauritius-serving provider.

### Option F — Other providers
- **SBM Bank**: SBM Tag supports merchant QR and MauCAS payments; a separate e-commerce acquiring page exists — [banking.sbmgroup.mu/sbm-tag](https://banking.sbmgroup.mu/sbm-tag), [banking.sbmgroup.mu/merchant-corner/ecommerce](https://banking.sbmgroup.mu/merchant-corner/ecommerce) — but no fees, API, or reconciliation detail is public. `UNKNOWN`, would need direct inquiry. No evidence it's cheaper or more automatable than MCB/MIPS.
- **Absa Bank Mauritius**: E-commerce via CyberSource, including a "pay-by-link" feature with **confirmed per-transaction trackable IDs** in the CyberSource merchant portal — [absabank.mu/.../absa-e-commerce-solutions](https://www.absabank.mu/en/sme-and-business/absa-e-commerce-solutions/). Fees `NOT PUBLIC`. Card-only — same customer-fit problem as Option D.
- **MauBank**: only merchant-facing content found was international SWIFT/bulk transfers, no local merchant QR/gateway product — **excluded**, no evidence of fit.
- **PayPal**: has a Mauritius-labelled country page but Mauritius business/merchant-account support with local MUR settlement was **not confirmed** from official content — `UNKNOWN`, do not rely on it without direct verification.
- **Stripe**: **confirmed NOT to support Mauritius-based merchants** — Mauritius is absent even from Stripe's African "Extended Network" (Paystack) list — [stripe.com/global](https://stripe.com/global). **REJECT.**

---

## 2. Can a unique booking reference flow through the payment? (the core reconciliation question)

This is the single most important technical question, and the answer differs sharply by option:

| Path | Reference support | Confidence |
|---|---|---|
| Manual Juice (A) | None — matching is by amount + rough timing, done by a human | Confirmed (it's how it works today) |
| MCB Juice Merchant QR (B1) | None confirmed — QR carries no transaction data, amount is customer-typed | Confirmed absence |
| MCB Juice via Peach (B2) | Likely, as a standard PSP checkout (order ID is normal for this class of product) but not explicitly documented for this specific integration | Plausible, needs direct confirmation |
| MauCAS QR via Peach | **Confirmed**: generates a unique code per transaction | Confirmed from Peach's own product page |
| MIPS QuickPay (C) | Plausible ("customize data to include in payment tickets") but no confirmed structured order-ID field | Unconfirmed |
| MIPS full API (C2) | Likely, standard for a full gateway API, not explicitly documented in what was reachable | Plausible, needs direct confirmation |
| MCB Mastercard gateway (D) | Standard for card gateways | Plausible, not Mauritius-specific-confirmed |
| Absa/CyberSource | **Confirmed**: trackable transaction IDs in the merchant portal | Confirmed, but card-only |

Net: **no option available to a small Mauritian sole trader has fully public, confirmed, deterministic reference-matching for a Juice-based payment today** — MauCAS-via-Peach is the closest to a confirmed answer, everything else needs a direct question put to the provider before committing engineering time.

---

## 3. Rs 500 economics

Booking volumes, using 4.33 weeks/month: 15/week ≈ **65/month**, 30/week ≈ **130/month**, 60/week ≈ **260/month**. Monthly deposit value processed: Rs 32,500 / Rs 65,000 / Rs 130,000 respectively.

### Per-transaction fee, where publicly known

| Provider | Fee per Rs 500 txn | Effective % | 65/mo | 130/mo | 260/mo |
|---|---:|---:|---:|---:|---:|
| Manual Juice (A) | Rs 0 | 0% | Rs 0 | Rs 0 | Rs 0 |
| MCB Juice Merchant QR (B1), current promo | Rs 0 (until 30 Jun 2026) | 0% | Rs 0 | Rs 0 | Rs 0 |
| MCB Juice Merchant QR (B1), post-promo | NOT PUBLIC | — | REQUIRES QUOTE | REQUIRES QUOTE | REQUIRES QUOTE |
| MCB Juice via Peach (B2) | **Rs 11.00** (1.5% + Rs 3.50) | **2.20%** | **Rs 715** | **Rs 1,430** | **Rs 2,860** |
| MauCAS via Peach | NOT PUBLIC (volume-based) | — | REQUIRES QUOTE | REQUIRES QUOTE | REQUIRES QUOTE |
| MIPS QuickPay/API (C/C2) | NOT PUBLIC | — | REQUIRES QUOTE | REQUIRES QUOTE | REQUIRES QUOTE |
| MCB Mastercard gateway (D) | NOT PUBLIC | — | REQUIRES QUOTE | REQUIRES QUOTE | REQUIRES QUOTE |
| Absa/CyberSource | NOT PUBLIC | — | REQUIRES QUOTE | REQUIRES QUOTE | REQUIRES QUOTE |

### Monthly fixed subscription, where publicly known (MIPS only)

| Provider tier | 1-month | 12-month | 24-month |
|---|---:|---:|---:|
| MIPS Essential (online, ex. QuickPay) | Rs 1,400 | Rs 1,250 | Rs 1,000 |
| MIPS Pro (multi-outlet/API) | Rs 2,200 | — | Rs 1,650 |

As a % of monthly deposit value processed (using the 12-month Essential rate, Rs 1,250/mo, subscription only — **excludes the still-unknown per-transaction fee**): **3.8%** at 65/mo, **1.9%** at 130/mo, **0.96%** at 260/mo. A flat monthly fee gets proportionally cheaper as volume grows — the opposite shape from a pure percentage fee like Peach's.

---

## 4. Staff-time cost of manual verification

```
ASSUMPTION: 3 minutes of manual verification per booking (check bank/Juice
statement, match to the right client, confirm). Not sourced from Méhua
directly — a placeholder for this calculation, consistent with the "several
times/week, repeated per booking" burden she described in the original
discovery interview.
```

| Volume | Minutes/month | Hours/month |
|---|---:|---:|
| 15/week (65/mo) | 195 min | 3.25 hrs |
| 30/week (130/mo) | 390 min | 6.5 hrs |
| 60/week (260/mo) | 780 min | 13 hrs |

**Example sensitivity only, not a real wage figure**: applying the Rs 500–700/hr imputed time-value already used elsewhere in this project's own business-planning docs (`reference/Mauritius_Automation_Business_Final_Report.docx`, §2) as a stand-in for the value of the owner's time:

| Volume | Hours/month | Value at Rs 500–700/hr (example only) |
|---|---:|---:|
| 65/mo | 3.25 | Rs 1,625 – Rs 2,275 |
| 130/mo | 6.5 | Rs 3,250 – Rs 4,550 |
| 260/mo | 13 | Rs 6,500 – Rs 9,100 |

This is illustrative, not a claim about what Méhua's time is actually worth to her — but it's directionally useful: **at every volume tested, the imputed cost of manual verification exceeds the known Peach/MCB-Juice automated fee (Rs 715–2,860/mo)**. That's the core argument for paying a small transaction fee rather than treating "Rs 0 processing cost" as automatically cheapest — see the Break-Even section below.

---

## 5. Total cost comparison and reconciliation quality

| Option | Setup | Monthly | Rs500 txn cost | API/Webhook | Unique reference | Auto reconciliation | Customer friction | Complexity | Verdict |
|---|---:|---:|---:|---|---|---|---|---|---|
| A — Manual Juice | Rs 0 | Rs 0 | Rs 0 | None | None | None (fully manual) | Medium (screenshot round-trip) | None | **FALLBACK ONLY** |
| B1 — MCB Juice Merchant QR | Rs 0 | Rs 0 | Rs 0 (promo) / REQUIRES QUOTE after Jun 2026 | Not documented | Not confirmed | Poor (amount/time matching only) | Low (simple scan) | Low | **VIABLE** |
| B2 — MCB Juice via Peach | REQUIRES QUOTE | NOT PUBLIC | Rs 11.00 (2.20%) | Likely (standard PSP) | Plausible, unconfirmed | Plausible-good, unconfirmed | Low-Medium (checkout flow) | Medium | **STRONG OPTION** |
| MauCAS via Peach | REQUIRES QUOTE | NOT PUBLIC | NOT PUBLIC | Likely (standard PSP) | **Confirmed** | **Best confirmed** | Low (QR scan, any bank app) | Medium | **STRONG OPTION** |
| C — MIPS QuickPay | REQUIRES QUOTE | Rs 1,000–1,400 | REQUIRES QUOTE | Plausible | Plausible, unconfirmed | Plausible, unconfirmed | Low (link via WhatsApp/SMS) | Medium | **VIABLE** |
| C2 — MIPS full API | REQUIRES QUOTE | Rs 1,650–2,200 | REQUIRES QUOTE | Yes (developer portal exists) | Plausible, unconfirmed | Plausible-good, unconfirmed | Low-Medium | High | **VIABLE** (better fit once multiple clients need shared infra) |
| D — MCB Mastercard gateway | REQUIRES QUOTE | NOT PUBLIC | NOT PUBLIC | Yes (standard) | Plausible | Plausible-good | High (customers don't use cards) | Medium-High | **REJECT for this client** (wrong payment method) |
| Absa/CyberSource | REQUIRES QUOTE | NOT PUBLIC | NOT PUBLIC | Yes | **Confirmed** | **Confirmed** | High (card-only) | Medium-High | **REJECT for this client** (wrong payment method) |
| Stripe | — | — | — | — | — | — | — | — | **REJECT** (no Mauritius merchant support) |

---

## 6. Scoring (1–5, 5 = best)

| Option | Cost | Automation | Customer UX | Reconciliation | Impl. difficulty (5=easy) | Scalability | Merchant accessibility |
|---|---:|---:|---:|---:|---:|---:|---:|
| A — Manual Juice | 3 | 1 | 3 | 1 | 5 | 1 | 5 |
| B1 — MCB Juice Merchant QR | 4 | 2 | 4 | 2 | 4 | 2 | 3 |
| B2 — MCB Juice via Peach | 3 | 4 | 3 | 4 | 3 | 4 | 3 |
| MauCAS via Peach | 3 | 5 | 4 | 5 | 3 | 5 | 3 |
| C — MIPS QuickPay | 3 | 4 | 4 | 3 | 3 | 4 | 3 |
| C2 — MIPS full API | 2 | 5 | 4 | 4 | 2 | 5 | 3 |
| D — MCB Mastercard gateway | 2 | 3 | 2 | 4 | 2 | 4 | 2 |

Scores are directional, not a mechanical tiebreaker — see the qualitative discussion below for why the highest-scoring option isn't automatically the recommendation.

---

## 7. Three separate recommendations

### Cheapest
**Manual Juice (Option A) is cheapest in raw fees (Rs 0) and stays Phase 1's provider** — but it's the status quo, not a solution to the reconciliation problem, and §4 shows its real (imputed) cost already exceeds the cheapest automated alternative at every volume tested. Among options that meaningfully move away from all-manual verification, **MCB Juice Merchant QR (B1) is cheapest** — Rs 0 during the current promo (through 30 June 2026), no setup cost, no equipment. It does **not** solve deterministic reconciliation (no reference field confirmed), so it's a friction reducer (no more screenshot relay), not an automation solution.

### Best Automation
**MauCAS QR via Peach Payments.** It's the only option in this entire research pass with an explicit, official confirmation of a unique code generated per transaction — exactly the deterministic matching (`MEHUA-142` → payment → `MEHUA-142`) the whole exercise is optimizing for. Caveats: pricing is not public (volume-based, requires a quote), and the merchant-facing counterparty is Peach Payments (a South African PSP) sitting in front of the Mauritian rails (MauCAS/BOM, MCB) — worth confirming this still satisfies "settles through a regulated Mauritian-serving provider" to your comfort, even though Peach explicitly operates in and serves the Mauritius market for exactly this purpose.

### Best Overall
**MCB Juice via Peach Payments (Option B2).** Reasoning: it's the only Juice-compatible automated option with a **fully public, concrete fee** (1.5% + Rs 3.50/txn ≈ 2.20%); it's **MCB's own official route** for bringing Juice online (not a third-party workaround); it uses the **exact payment method Méhua's customers already use** (unlike the card-only options D and Absa); and as a standard PSP checkout it very plausibly (though not yet confirmed) supports order references the way any modern gateway does. It's a genuine step up from both A and B1 without the heavier onboarding/cost profile of a full MIPS integration. MauCAS-via-Peach is the natural next upgrade once its reconciliation and pricing details are directly confirmed — the two may turn out to be the same underlying Peach relationship with different payment rails switched on.

---

## 8. Break-even analysis

```
Manual (Option A):
  Rs 0 processing fee
  + staff time (ASSUMPTION: 3 min/booking)

MCB Juice via Peach (Option B2):
  Rs 11.00/booking processing fee (1.5% + Rs 3.50)
  + near-zero verification time (payment status is provider-confirmed,
    though the actual reference-matching mechanic still needs confirming)
```

| Volume | Manual: imputed staff cost (Rs 500–700/hr example) | Peach: processing fee | Automation "pays for itself" once... |
|---|---:|---:|---|
| 65/mo | Rs 1,625 – 2,275 | Rs 715 | **Already cheaper today**, even before counting reduced error/mismatch risk |
| 130/mo | Rs 3,250 – 4,550 | Rs 1,430 | **Already cheaper today** |
| 260/mo | Rs 6,500 – 9,100 | Rs 2,860 | **Already cheaper today**, and the gap widens with volume |

At every volume this project specified, the automated option's processing fee is already lower than the imputed staff-time cost of the manual process — using the example wage sensitivity only. If Méhua's actual verification time is much lower than 3 min/booking, or her time has genuinely near-zero opportunity cost, this conclusion could flip — that's exactly why it's labeled a sensitivity calculation, not a fact.

---

## 9. Automatic reconciliation — what "good" looks like here

The target pattern is deterministic: `MEHUA-142 → payment → MEHUA-142`. A payment method scores poorly if a Rs 500 payment arrives but nothing ties it to a specific booking. Two variables matter independently: (1) does the payment carry a merchant-chosen reference at all, and (2) can the merchant query payment status programmatically (API/webhook) rather than reading a portal by hand. MauCAS-via-Peach is the only option confirmed on (1); several PSP-standard options (B2, C, C2, Absa) are plausible-but-unconfirmed on both and need a direct question to the provider before any integration work starts.

---

## 10. Security and card-data posture

No option in this document proposes scraping MCB internet banking, Juice, bank statements, or customer screenshots as a production verification mechanism — the existing Phase 1 workflow's owner-verification step (a human checking her own account) is a legitimate manual process, not scraping, and stays as the fallback regardless of what's chosen later. No banking passwords, Juice PINs, OTPs, or full card data would ever be stored by this system under any option evaluated. Where card payments are involved at all (Options D, Absa), only a **provider-hosted checkout** should ever be used — the automation system would never see a raw card number, expiry, or CVV, keeping PCI DSS scope at zero. This is moot for Méhua specifically today, since her customers pay via Juice, not cards.

---

## 11. Regulatory flag — read before acting, not a legal opinion

Mauritius's **National Payment Systems Act 2018** (BOM-administered) requires a licence to act as a "payment service provider," and — importantly — **"payment initiation services" is itself listed as a licensable payment service** (First Schedule, item 7), with no Mauritius equivalent found of the EU's PSD2 "technical service provider" exemption for parties who never touch funds. [NPSA 2018 text](https://www.bom.mu/sites/default/files/the_national_payment_systems_act_2018_amended_12.08.21_plain.pdf); [BOM legislation page](https://www.bom.mu/about-bank/legislations/national-payment-systems-act-2018).

The architecture this document assumes throughout — **the client (Méhua, or any future client) holds their own merchant agreement and PSP relationship; the agency's automation only reads payment status/reference/amount after the regulated provider has processed the transaction, and never initiates or moves funds itself** — structurally looks like a back-office integration rather than "acting as" the payment service provider, since the licensed provider remains the entity actually executing the transaction. **But no Bank of Mauritius guidance was found that directly addresses this specific SaaS/automation-vendor pattern**, so this is flagged as `UNKNOWN — needs legal confirmation`, not asserted as safe. The one scenario that clearly raises the regulatory bar is discussed next.

If instead **the agency held the merchant account and customer funds passed through the agency's own bank account** before reaching clients, that looks materially closer to licensable activity (execution of payment transactions / money remittance) and should be avoided for that reason alone, independent of the licensing question — which is also why the ownership model in §12 puts the merchant account with the client, not the agency.

---

## 12. Who should own what

| | Owner |
|---|---|
| Merchant account / PSP agreement | **Client (Méhua)** |
| Transaction fees | **Client**, paid directly to the provider |
| Payment credentials (API keys, portal login) | **Client**, shared with the agency only as needed for integration, never re-hosted as the agency's own credentials |
| Settlement account (where money actually lands) | **Client's own bank account** |
| Automation, workflow, monitoring, reconciliation logic | **Agency** |

This matches every option investigated — none of the researched providers require or particularly favor the integrator holding the merchant account, and it's the model that keeps the agency furthest from payment-service licensing exposure (§11). **Agency commercial model stays clean under this split**: setup fee + monthly automation-management fee + optional support, charged by the agency to the client, while processing fees flow client → provider directly and never touch the agency's books.

---

## 13. Provider-independence architecture (preparation only — nothing below is implemented)

```
Booking
  ↓
PaymentProvider.createPayment(bookingRef, amountMur, currency)
  ↓
provider-specific payment flow (QR shown / link sent / checkout opened)
  ↓
PaymentProvider.verifyPayment(bookingRef)  — or an inbound webhook
  ↓
normalized result: { bookingRef, status, amount, currency, providerTxnId }
  ↓
Deposit state machine (unchanged from the existing prototype:
AWAITING_DEPOSIT → PROOF_RECEIVED → AWAITING_MANUAL_VERIFICATION →
DEPOSIT_VERIFIED / DEPOSIT_REJECTED, plus OVERDUE / NEEDS_HUMAN_REVIEW)
```

Provider identifiers for future config use: `MANUAL_JUICE_TRANSFER` (current, only one actually built), `MCB_JUICE_MERCHANT_QR`, `MCB_JUICE_VIA_PEACH`, `MAUCAS_VIA_PEACH`, `MIPS_QUICKPAY`, `MIPS_API`. None of these beyond `MANUAL_JUICE_TRANSFER` are implemented — this is purely the shape a future `payment_provider` config field and provider-specific module would take, so that switching providers later doesn't mean rebuilding the deposit state machine. **Even under an automated provider, `DEPOSIT_VERIFIED` should arguably still pass through a human-visible confirmation step for Phase 1** — trusting a webhook completely on day one, for a brand-new integration with unconfirmed reconciliation semantics, is a bigger leap than this project needs to take yet. That's a design choice for whenever a provider is actually selected, not a decision this document is making now.

---

## 14. Productization potential

The general pattern — fixed or variable deposit amount, automated payment request, provider-confirmed status, deterministic reference matching, human-verification fallback — generalizes directly to any appointment-based or booking-based SME: other salons/lash technicians, clinics, tutors, car rentals, contractors, event bookings, hospitality. **Score: high.** The specific blocker to productizing today isn't the business logic (already generic in the state-machine design above) — it's that no option researched here has a fully confirmed, public reconciliation mechanism yet. Once one provider's reference-matching and API/webhook behavior is confirmed directly (see §16, Next Action), the resulting `PaymentProvider` module becomes reusable agency infrastructure, not a one-off for Méhua.

---

## 15. Specific questions, answered directly

1. **Can we automate Juice payment confirmation without MIPS?** Yes — see §16.
2. **Does MCB provide a cheaper merchant/QR path that still supports automatic reconciliation?** MCB Juice Merchant QR (B1) is cheaper (Rs 0 promo) but does **not** confirm automatic reconciliation (no reference field). MCB Juice via Peach (B2) is not free but has a known, moderate fee and a plausible (unconfirmed) reconciliation path.
3. **Can dynamic QR solve our problem?** Yes, in principle — MauCAS via Peach is confirmed to generate a unique code per transaction. Not yet confirmed as accessible/priced for a business Méhua's size.
4. **Can a unique booking reference flow through the payment?** Confirmed for MauCAS via Peach; plausible-but-unconfirmed for MIPS and MCB-via-Peach; confirmed absent for the static MCB Juice Merchant QR.
5. **Can n8n receive or query trusted payment status?** Architecturally yes, once a provider with a real webhook/API is selected and confirmed (none of the Juice-compatible options has a fully documented public API in this research pass — all need a direct developer conversation).
6. **Is MIPS worth its fee for a Rs 500 deposit?** Marginal at Méhua's current volume — its monthly subscription (Rs 1,000–1,400+) is a bigger fixed cost than Peach's per-transaction fee at 65–130 bookings/month, though it becomes proportionally cheaper at higher volume and is a stronger fit once the agency has several clients sharing the integration.
7. **What is the cheapest viable solution?** MCB Juice Merchant QR (B1), during the current 0%-fee promotional window — with the explicit caveat that it doesn't solve reconciliation.
8. **What is the best customer experience?** MCB Juice Merchant QR (B1) or a MauCAS QR — both are a simple scan-and-pay the customer already understands, no new app, no checkout redirect.
9. **What is the best balance of cost + automation?** MCB Juice via Peach (B2) — see §7, Best Overall.
10. **Would we need payment-service licensing for our intended architecture?** `UNKNOWN — needs legal confirmation`, but the client-holds-the-merchant-account model in §12 is the structurally safer posture under Mauritius's National Payment Systems Act — see §11.
11. **Who should own the merchant account?** The client (Méhua) — §12.
12. **Who should pay transaction fees?** The client, directly to the provider — §12.

---

## 16. Next action

The single highest-value next step: **ask MCB (or Peach Payments directly) whether the Juice-via-Peach online checkout (Option B2) supports a merchant-supplied order/booking reference per transaction, and whether payment status can be queried by that reference via API or webhook.** This one answer resolves the biggest open unknown across every option in this document — Peach is the common thread behind both the cheapest-with-known-pricing option (B2) and the best-automation option (MauCAS), so confirming its reference/reconciliation behavior is worth more than any other single question that could be asked right now. Contact: [peachpayments.com/mcb-juice](https://www.peachpayments.com/mcb-juice) or MCB SME/merchant services.

---

## Sources

MCB: [Juice FAQ](https://mcb.mu/docs/juicelibraries/default-document-library/juice-documents/-view-juice-frequently-asked-questions.pdf?sfvrsn=b68305f5_2) · [Juice Merchant campaign](https://mcb.mu/sme/campaign/juice-merchant) · [JuicePro](https://mcb.mu/sme/bank/transact-anytime-anywhere/mcb-juicepro) · [Corporate Mobile Banking](https://mcb.mu/corporate/payment-cash/collect/mobile-banking) · [Business Banking Pricing PDF](https://mcb.mu/docs/mcb/rates-fees/fees-charges/business-banking-pricing.pdf?sfvrsn=ed9da991_23) · [E-Banking Tariff Guide PDF](https://mcb.mu/docs/mcb/rates-fees/fees-charges/e-banking-tariff-guide.pdf?sfvrsn=9069a8fb_16) · [Online Payment Gateway](https://mcb.mu/corporate/payment-cash/collect/e-commerce/online-payment-gateway) · [SME E-commerce Solutions](https://mcb.mu/sme/pay/electronic-payments/e-commerce-solutions) · [Personal payment solutions](https://mcb.mu/personal/ways-to-bank/payment-solutions) · [MCB Group: Peach Payments partnership announcement](https://mcbgroup.com/news/article/ecommerce-partnership-with-peach-payments-for-mcb-juice)

MIPS: [Pricing](https://mips.mu/pricing/) · [QuickPay](https://mips.mu/quickpay) · [E-commerce solutions](https://mips.mu/e-commerce-solutions/) · [Payment gateway](https://mips.mu/payment_gateway.php) · [Partners](https://mips.mu/mips-partners/) · [Pop/MIPS](https://www.mips.mu/pop_mips/) · [Developer docs portal](https://docs.mips.mu/)

Peach Payments: [MCB Juice](https://www.peachpayments.com/mcb-juice) · [MauCAS](https://www.peachpayments.com/pay-with/maucas/)

Bank of Mauritius: [MauCAS](https://www.bom.mu/maucas-0) · [MauCAS QR](https://www.bom.mu/maucasqrcode) · [National Payment Switch](https://www.bom.mu/payment-systems/national-payment-switch) · [National Payment Systems Act 2018 (PDF)](https://www.bom.mu/sites/default/files/the_national_payment_systems_act_2018_amended_12.08.21_plain.pdf) · [NPSA legislation page](https://www.bom.mu/about-bank/legislations/national-payment-systems-act-2018) · [Authorisation and Licensing Regulations 2021 (PDF)](https://www.bom.mu/sites/default/files/national-payment-systems-authorisation-and-licensing-regulations-no-118-2021_with_caveat_0.pdf)

Other providers: [SBM Tag](https://banking.sbmgroup.mu/sbm-tag) · [SBM e-commerce](https://banking.sbmgroup.mu/merchant-corner/ecommerce) · [Absa e-commerce](https://www.absabank.mu/en/sme-and-business/absa-e-commerce-solutions/) · [MauBank payment solutions](https://maubank.mu/international/services/payment-solutions/) · [Stripe global coverage](https://stripe.com/global) · [FSC FinTech licensing](https://www.fscmauritius.org/licensing-supervision/licensing/fintech) · [DPO draft guide for financial institutions (PDF)](https://dataprotection.govmu.org/Documents/Draft%20_Financial_Guide_UpdatedV7.pdf)

Secondary/context only (not relied on for any factual claim above): Bowmans legal summary of the NPSA regulations.
