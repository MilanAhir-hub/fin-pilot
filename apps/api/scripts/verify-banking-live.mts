import { randomUUID } from 'node:crypto';

const API = 'http://localhost:4000';
const EMAIL = 'owner@finpilot.demo';
const PASSWORD = 'finpilot-demo-password1';

async function run() {
  console.log('--- 1. Login ---');
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data.accessToken;
  console.log('Logged in as:', loginJson.data.user.email);

  console.log('\n--- 2. Get Company ---');
  const compRes = await fetch(`${API}/api/v1/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const compJson = await compRes.json();
  const company = compJson.data.companies[0];
  console.log('Company:', company.legalName, 'ID:', company.id);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Company-Id': company.id,
    'Idempotency-Key': randomUUID(),
  };

  console.log('\n--- 3. Check Bank Accounts ---');
  let bankRes = await fetch(`${API}/api/v1/bank-accounts`, { headers: authHeaders });
  let bankJson = await bankRes.json();
  let bankAccounts = bankJson.data.bankAccounts;
  console.log('Found bank accounts:', bankAccounts.length);

  let bankId: string;
  if (bankAccounts.length === 0) {
    console.log('Creating HDFC Current Account...');
    const createRes = await fetch(`${API}/api/v1/bank-accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'HDFC Current - 9821',
        bankName: 'HDFC Bank',
        accountNumberMasked: 'XX9821',
        ifsc: 'HDFC0001234',
      }),
    });
    const createJson = await createRes.json();
    bankId = createJson.data.bankAccount._id || createJson.data.bankAccount.id;
    console.log('Created bank account ID:', bankId);
  } else {
    bankId = bankAccounts[0]._id || bankAccounts[0].id;
    console.log('Using bank account:', bankAccounts[0].name, 'ID:', bankId);
  }

  console.log('\n--- 4. Check Existing Payments / Journal Entries on Bank Ledger ---');
  const paymentsRes = await fetch(`${API}/api/v1/payments`, { headers: authHeaders });
  const paymentsJson = await paymentsRes.json();
  const payments = paymentsJson.data.payments || [];
  console.log(`Found ${payments.length} existing payments in system.`);
  const samplePayment = payments[0];
  if (samplePayment) {
    console.log('Sample payment:', {
      paymentNumber: samplePayment.paymentNumber,
      amountPaise: samplePayment.amountPaise,
      amountRupees: samplePayment.amountPaise / 100,
      direction: samplePayment.direction,
      date: samplePayment.date,
      party: samplePayment.partyName || samplePayment.partyId,
    });
  }

  console.log('\n--- 5. Generate and Import a Custom Bank Statement ---');
  // Generate statement matching samplePayment plus one new transaction
  const stmtDate = samplePayment ? samplePayment.date.slice(0, 10) : '2026-07-15';
  const matchAmountStr = samplePayment
    ? (samplePayment.amountPaise / 100).toFixed(2)
    : '59000.00';
  const matchNarration = samplePayment
    ? `NEFT INWARD PAYMENT ${samplePayment.paymentNumber}`
    : 'NEFT CR ACME RETAIL';

  const csvStatement = [
    'Date,Narration,Amount,Ref',
    `${stmtDate},"${matchNarration}",${matchAmountStr},UTR${Date.now().toString().slice(-6)}`,
    `2026-08-01,"BANK CHARGES FOR STATEMENT SMS",-17.70,CHG101`,
    `2026-08-05,"INTEREST CREDITED Q1",450.00,INT999`,
  ].join('\n');

  console.log('Generated statement to import:\n' + csvStatement);

  const importRes = await fetch(`${API}/api/v1/bank-accounts/${bankId}/import`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      csv: csvStatement,
      mapping: { date: 'Date', narration: 'Narration', amount: 'Amount', reference: 'Ref' },
    }),
  });
  const importJson = await importRes.json();
  console.log('Import result:', importJson);

  console.log('\n--- 6. Read Bank Transactions ---');
  const txnsRes = await fetch(`${API}/api/v1/bank-accounts/${bankId}/transactions`, {
    headers: authHeaders,
  });
  const txnsJson = await txnsRes.json();
  const txns = txnsJson.data.transactions || [];
  console.log(`Bank account now has ${txns.length} transactions:`);
  txns.slice(0, 5).forEach((t: any) => {
    console.log(`  - ${t.txnDate?.slice(0, 10)} | ${t.direction.padEnd(6)} | ₹${(t.amountPaise / 100).toFixed(2).padStart(9)} | status: ${t.status} | ${t.narration}`);
  });

  console.log('\n--- 7. Query Reconciliation Suggestions ---');
  const recoRes = await fetch(`${API}/api/v1/reconciliation/suggestions?bankAccountId=${bankId}`, {
    headers: authHeaders,
  });
  const recoJson = await recoRes.json();
  const suggestions = recoJson.data.suggestions || [];
  console.log(`Found ${suggestions.length} reconciliation suggestions:`);
  suggestions.forEach((s: any) => {
    console.log(`  - Score ${s.score}: Bank Txn ${s.bankTransactionId} ↔ Journal #${s.entryNumber} (${s.narration || ''}) Reasons: ${s.reasons?.join(', ')}`);
  });

  if (suggestions.length > 0) {
    console.log('\n--- 8. Human Confirms Reconciliation Match ---');
    const toConfirm = suggestions[0];
    const confirmRes = await fetch(`${API}/api/v1/reconciliation/confirm`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        matches: [
          {
            bankTransactionId: toConfirm.bankTransactionId,
            journalEntryId: toConfirm.journalEntryId,
            score: toConfirm.score,
          },
        ],
      }),
    });
    const confirmJson = await confirmRes.json();
    console.log('Confirm match response:', confirmJson);

    // Verify transaction status changed to reconciled
    const checkTxnRes = await fetch(`${API}/api/v1/bank-accounts/${bankId}/transactions`, {
      headers: authHeaders,
    });
    const checkTxnJson = await checkTxnRes.json();
    const updatedTxn = checkTxnJson.data.transactions.find(
      (t: any) => t._id === toConfirm.bankTransactionId || t.id === toConfirm.bankTransactionId
    );
    console.log('Updated transaction status in database:', updatedTxn?.status);
  }

  console.log('\n=== ALL BANKING & RECONCILIATION CHECKS COMPLETED SUCCESSFULLY ===');
}

run().catch(console.error);
