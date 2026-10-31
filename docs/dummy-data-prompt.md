# Dummy data generation — the prompt

A reusable prompt for generating realistic test data for FinPilot. It is deliberately
**company-agnostic**: it describes the *shape and rules* of the data, so it produces a different
believable business every time rather than one hardcoded example.

**How to use it:** paste everything inside the fence below into an AI coding assistant working in
this repo. Adjust the VOLUME block at the top to taste.

---

## The prompt

```text
Write a seed script for the FinPilot repository that generates realistic dummy data for ONE company.

## The single most important rule

Do NOT insert documents directly into the `invoices`, `bills`, `journalentries`, `payments`,
`counters` or `accounts` collections. Create everything by calling the existing services
(invoiceService, billService, paymentService, partyService, itemService, bankingService,
expenseService, accountService) inside a request context, exactly the way
`apps/api/scripts/seed-demo.mts` does.

Writing raw documents breaks three invariants at once and every report silently becomes wrong:
  - I2  every journal entry must balance (sum debits === sum credits)
  - I3  only GeneralLedger.post() may write to `journalentries`
  - I6  document numbers must be gapless per company, per financial year, per series
Going through the services means the ledger postings, GST splits, document numbers and
running balances are all produced by the real code paths — which is also what makes the
seeded data useful for testing.

## Hard constraints

- All money is an INTEGER number of paise. Never a float, never a string, never Decimal128.
  Rs. 1,500.0 0 is `150000`. Every money variable name ends in `Paise`.
- Dates must fall inside one Indian financial year (1 April to 31 March) and must be on or
  after the company's `booksBeginDate`.
- `stateCode` must be a real 2-digit GST state code that exists in GST_STATE_CODES.
- GSTIN format: 2-digit state code + 10-character PAN + 1 entity digit + 'Z' + 1 checksum char.
  The state code prefix MUST match the party's own state.
- GST split is decided by comparing the company's state with the place of supply:
    same state      -> CGST + SGST, each exactly half the tax
    different state -> IGST, the full tax
  Never emit both CGST/SGST and IGST on the same line.
- Never set totals yourself where a service computes them. Pass quantity, rate and discount;
  let the server produce taxable value, tax and grand total.

## What to generate, and how much

VOLUME (tune these):
  parties            12   (about 8 customers, 4 vendors)
  items              15   (mix of goods and services)
  invoices           40   spread across the financial year
  bills              20
  payments           ~70% of invoices, some partial
  expenses           15
  bank accounts       2
  bank transactions  60   covering roughly 3 months

1. PARTIES — Indian SME counterparties. Vary them deliberately:
   - most `regular` GST-registered, in several different states
   - at least 2 `unregistered` (no GSTIN) — these must still produce valid invoices
   - at least 1 `composition` dealer
   - at least 1 in the company's own state and several outside it, so both the
     CGST+SGST and the IGST paths get exercised
   - realistic Indian business names; do not reuse one naming pattern for all of them

2. ITEMS — a believable catalogue for the business:
   - a mix of `goods` (with 4- or 6-digit HSN) and `service` (with SAC)
   - GST rates drawn from the real slabs: 0, 5, 12, 18, 28
   - sellingPricePaise above purchasePricePaise, so margin exists
   - sensible units (nos, kg, hour, month)

3. INVOICES — this is the important set. Spread issue dates across the whole year, and
   make sure ALL of these states exist in the data, because each one exercises a
   different screen:
   - `paid` in full
   - `partially_paid`
   - `issued` and not yet due
   - `overdue` — due date in the past, still unpaid. Include a few at different ages
     (under 30 days, 30-60, 60-90, over 90) so the ageing buckets are all populated
   - `draft` — never issued, so it must have NO document number
   - `cancelled`
   Vary line counts from 1 to 5. Include at least one invoice with a line discount,
   and at least one multi-rate invoice (different gstRate per line).

4. BILLS — supplier invoices, same discipline. Some `approved` and fully paid, some
   approved and outstanding, at least one `draft`. Give each a realistic
   `vendorBillNumber` in the SUPPLIER's own numbering style, not yours.

5. PAYMENTS — allocate against invoices and bills. Include partial allocations and at
   least one payment that settles two invoices at once. Use varied methods
   (upi, neft, rtgs, cheque, cash).

6. EXPENSES — operating costs posted to real expense accounts from the seeded chart of
   accounts (rent, salaries, utilities, travel, professional fees). Include each status:
   submitted, approved, rejected, reimbursed.

7. BANK ACCOUNTS AND TRANSACTIONS — two accounts, each mapped to a bank ledger account.
   Generate statement lines that mostly correspond to the payments above so reconciliation
   has something to match, PLUS deliberately:
   - 3-5 lines with no matching payment (bank charges, interest, an unknown credit)
   - 1-2 payments with no matching bank line
   - one near-duplicate pair, to prove the fingerprint de-duplication works
   Set `status: 'unreconciled'` and let the matcher do the rest.

## Edge cases worth including

These are the ones that break software, so seed them on purpose:
  - an invoice on 31 March and another on 1 April, to prove the financial-year boundary
  - a zero-rated (0% GST) line
  - a reverse-charge bill
  - an invoice to an unregistered customer with no GSTIN
  - a party whose state code equals the company's, and one whose does not
  - a credit note / reversing entry, so the append-only correction path is demonstrated
  - an amount large enough to be grouped in the Indian style (over Rs. 1 lakh)

## Deliberately do NOT generate

  - anything in `journalentries` directly — the services produce those
  - any value in `counters` — numbering is produced inside the creating transaction
  - IMS records, unless asked: the GSP client is a mock that returns an empty list, and
    fake IMS rows would misrepresent an unfinished integration
  - users, organizations, memberships or roles — the company and its owner already exist;
    the script takes an existing companyId

## Shape of the script

  - Place it at `apps/api/scripts/seed-dummy.mts`, following the structure of `seed-demo.mts`
  - Take the target company id as a CLI argument; refuse to run without one
  - Wrap the work in `requestContext.run({ companyId, userId }, ...)` so the tenant plugin
    scopes every write
  - Use a SEEDED random number generator so a given seed reproduces the same dataset
  - Print a summary at the end: how many of each entity were created, the resulting
    trial-balance totals, and an explicit confirmation that total debits === total credits
  - Make it idempotent or clearly destructive — say which, and never silently mix the two

## Finally, prove it worked

After seeding, fetch the trial balance and assert that total debits equal total credits.
If they do not, the seed is wrong — fail loudly rather than leaving an unbalanced ledger
behind. Then print the P&L and balance sheet totals so the result can be eyeballed.
```

---

## Why the prompt is built this way

**It forbids direct inserts first, before anything else.** That is the one mistake that produces
data which *looks* fine in a list view and is wrong in every report. A generator that writes
invoices without postings gives you a ledger where the trial balance does not balance, and the
failure only surfaces later, in a report nobody trusts after that.

**It asks for variety in status, not volume.** Forty invoices that are all `paid` test one code
path. Forty spread across paid / partial / overdue at four different ages / draft / cancelled
exercise the ageing buckets, the dashboard tiles, the aged-receivables report and the Copilot's
list tools. The edge-case list exists for the same reason — the financial-year boundary and the
intra vs inter-state split are where GST logic actually breaks.

**It stays company-agnostic.** Volumes and states are parameters; names, sectors and amounts are
left to the generator. Running it twice gives two different believable businesses, which is what
you want for demos and for finding assumptions baked into one dataset.

**It demands proof at the end.** "Total debits === total credits" is the one assertion that
catches almost any seeding bug, and it costs one query.
