import { randomUUID } from 'node:crypto';

const API = 'http://localhost:4000';
const EMAIL = 'owner@finpilot.demo';
const PASSWORD = 'finpilot-demo-password1';

async function run() {
  console.log('=== VERIFYING RAZORPAY BILLING & SETTINGS ===');

  console.log('\n1. Logging in as Demo Owner...');
  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = (await loginRes.json()) as any;
  const token = loginJson.data?.accessToken;
  if (!token) throw new Error('Login failed: ' + JSON.stringify(loginJson));
  console.log('✓ Logged in:', loginJson.data.user.email);

  console.log('\n2. Fetching Company Context...');
  const compRes = await fetch(`${API}/api/v1/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const compJson = (await compRes.json()) as any;
  const company = compJson.data.companies[0];
  console.log('✓ Company:', company.legalName, 'ID:', company.id);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Company-Id': company.id,
    'Idempotency-Key': randomUUID(),
  };

  console.log('\n3. Fetching Initial Billing Status...');
  const initBillingRes = await fetch(`${API}/api/v1/billing`, { headers: authHeaders });
  const initBilling = (await initBillingRes.json()) as any;
  console.log('Initial Plan:', initBilling.data?.plan, '| Status:', initBilling.data?.status);

  console.log('\n4. Fetching Plan Catalogue & Razorpay Configuration...');
  const plansRes = await fetch(`${API}/api/v1/billing/plans`, { headers: authHeaders });
  const plansJson = (await plansRes.json()) as any;
  console.log('Razorpay Key ID configured:', plansJson.data?.razorpayKeyId);
  console.log('Razorpay Configured flag:', plansJson.data?.razorpayConfigured);
  console.log('Plans available:');
  plansJson.data?.plans.forEach((p: any) => {
    console.log(`  - ${p.key.padEnd(14)}: ₹${(p.pricePaise / 100).toFixed(2).padStart(8)}/mo | current: ${p.current} | subscribable: ${p.subscribable}`);
  });

  if (plansJson.data?.razorpayKeyId !== 'rzp_test_TNdoTB3rZAZO4l') {
    throw new Error(`Expected razorpayKeyId rzp_test_TNdoTB3rZAZO4l, got ${plansJson.data?.razorpayKeyId}`);
  }

  console.log('\n5. Executing Razorpay Subscription Activation (Upgrading to Starter)...');
  const mockPaymentId = `pay_rzptest_${Date.now().toString(36)}`;
  const activateRes = await fetch(`${API}/api/v1/billing/activate`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      plan: 'starter',
      paymentId: mockPaymentId,
    }),
  });
  const activateJson = (await activateRes.json()) as any;
  console.log('✓ Activation result:', activateJson);

  console.log('\n6. Verifying Updated Billing Overview...');
  const updatedBillingRes = await fetch(`${API}/api/v1/billing`, { headers: authHeaders });
  const updatedBilling = (await updatedBillingRes.json()) as any;
  console.log('✓ Upgraded Plan:', updatedBilling.data?.plan);
  console.log('✓ Subscription Status:', updatedBilling.data?.status);
  console.log('✓ New Limits:', updatedBilling.data?.limits);

  if (updatedBilling.data?.plan !== 'starter') {
    throw new Error(`Expected plan starter, got ${updatedBilling.data?.plan}`);
  }
  if (updatedBilling.data?.status !== 'active') {
    throw new Error(`Expected status active, got ${updatedBilling.data?.status}`);
  }

  console.log('\n=== RAZORPAY BILLING FULLY VERIFIED AND WORKING! ===');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
