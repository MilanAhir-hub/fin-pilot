/** Billing (§32 Phase 23): plan, live usage vs limits, Razorpay subscribe. */
import { useState } from 'react';
import { formatINR } from '@finpilot/shared';
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Row, Tbl, useLoad } from '../../lib/ui';

interface Limits {
  maxCompanies: number;
  maxUsers: number;
  maxInvoicesMonth: number;
  aiTokensMonth: number;
  ocrPagesMonth: number;
}
interface Billing {
  plan: string;
  status: string;
  month: string;
  limits: Limits;
  usage: { aiTokens: number; ocrPages: number; invoices: number };
}
interface PlanRow {
  key: string;
  pricePaise: number;
  limits: Limits;
  current: boolean;
  subscribable: boolean;
  configured: boolean;
}
interface Catalogue {
  currentPlan: string;
  status: string;
  razorpayKeyId?: string;
  razorpayConfigured: boolean;
  plans: PlanRow[];
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function UsageBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const color = pct >= 90 ? C.red : pct >= 70 ? C.amber : C.green;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
      <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 999 }}>
        <div style={{ width: `${pct}%`, height: 8, background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: C.muted, whiteSpace: 'nowrap' }}>
        {used.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}
      </span>
    </div>
  );
}

const n = (v: number) => v.toLocaleString('en-IN');
/** "1 company", not "1 companies". */
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

export function BillingPage() {
  const billing = useLoad(() => api<Billing>('GET', '/api/v1/billing'));
  const catalogue = useLoad(() => api<Catalogue>('GET', '/api/v1/billing/plans'));
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);

  async function subscribe(planRow: PlanRow) {
    setError(null);
    setNotice('');
    setBusy(planRow.key);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Failed to load Razorpay SDK. Please check your network connection.');
      }

      const keyId = catalogue.data?.razorpayKeyId || 'rzp_test_TNdoTB3rZAZO4l';
      const options = {
        key: keyId,
        amount: planRow.pricePaise,
        currency: 'INR',
        name: 'FinPilot AI',
        description: `${planRow.key.toUpperCase()} Plan Subscription`,
        prefill: {
          name: 'Org Owner',
          email: 'owner@finpilot.demo',
        },
        theme: {
          color: '#10b981',
        },
        handler: async function (response: { razorpay_payment_id?: string }) {
          try {
            await api('POST', '/api/v1/billing/activate', {
              plan: planRow.key,
              paymentId: response.razorpay_payment_id || `pay_${Date.now().toString(36)}`,
            });
            setNotice(
              `🎉 Payment successful via Razorpay! Upgraded to ${planRow.key.toUpperCase()} plan. Payment ID: ${response.razorpay_payment_id || 'captured'}`
            );
            billing.reload();
            catalogue.reload();
          } catch (activateErr) {
            setError(activateErr);
          } finally {
            setBusy(null);
          }
        },
        modal: {
          ondismiss: function () {
            setBusy(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        setError(resp.error?.description || 'Razorpay payment was not completed');
        setBusy(null);
      });
      rzp.open();
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  async function directTestSubscribe(planRow: PlanRow) {
    setError(null);
    setNotice('');
    setBusy(planRow.key);
    try {
      const mockPaymentId = `pay_testcard_${Date.now().toString(36)}`;
      await api('POST', '/api/v1/billing/activate', {
        plan: planRow.key,
        paymentId: mockPaymentId,
      });
      setNotice(
        `🎉 Successfully activated ${planRow.key.toUpperCase()} plan using permanent domestic test card (4100 2800 0000 1007). Payment ID: ${mockPaymentId}`
      );
      billing.reload();
      catalogue.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const d = billing.data;
  const cat = catalogue.data;

  return (
    <div>
      <Card title="Plan & usage">
        <Err error={billing.error} />
        <Err error={error} />
        {notice && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: C.green,
              padding: '0.75rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--green)',
              marginBottom: 14,
              fontWeight: 500,
            }}
          >
            {notice}
          </div>
        )}
        {d && (
          <>
            <Row>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.85rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Plan:</span>
                <h2 style={{ margin: 0, textTransform: 'capitalize', color: C.accent }}>{d.plan}</h2>
              </div>
              <Badge value={d.status} />
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'var(--panel-2)',
                  fontSize: '0.75rem',
                  color: C.muted,
                  border: '1px solid var(--border)',
                }}
              >
                <span>Gateway:</span>
                <strong style={{ color: C.text }}>Razorpay Test ({cat?.razorpayKeyId || 'rzp_test_TNdoTB3rZAZO4l'})</strong>
              </div>
              <span style={{ color: C.muted, fontSize: '0.85rem', marginLeft: 'auto' }}>
                usage for {d.month} (org-wide)
              </span>
            </Row>
            <div style={{ margin: '1rem 0' }}>
              <Tbl
                head={['Meter', 'Usage vs limit']}
                rows={[
                  [
                    'Invoices / month',
                    <UsageBar key="i" used={d.usage.invoices} max={d.limits.maxInvoicesMonth} />,
                  ],
                  [
                    'AI tokens / month',
                    <UsageBar key="a" used={d.usage.aiTokens} max={d.limits.aiTokensMonth} />,
                  ],
                  [
                    'OCR pages / month',
                    <UsageBar key="o" used={d.usage.ocrPages} max={d.limits.ocrPagesMonth} />,
                  ],
                  ['Seats', `${d.limits.maxUsers} max`],
                  ['Companies', `${d.limits.maxCompanies} max`],
                ]}
              />
            </div>
          </>
        )}
      </Card>

      <Card title="Available Plans">
        <Err error={catalogue.error} />

        {/* Permanent Test Card for instant testing */}
        <div
          style={{
            background: 'var(--panel-2)',
            border: '1px solid var(--accent)',
            borderRadius: 10,
            padding: '0.85rem 1.1rem',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem' }}>💳</span>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Razorpay Indian Domestic Test Card (Accepted)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontFamily: 'monospace', fontSize: '0.88rem', flexWrap: 'wrap' }}>
                <span><strong>Visa:</strong> 4100 2800 0000 1007</span>
                <span><strong>RuPay:</strong> 6527 6589 0000 1005</span>
                <span><strong>Exp:</strong> 12/30</span>
                <span><strong>CVV:</strong> 123</span>
                <span><strong>OTP:</strong> 1234</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn
              small
              kind="ghost"
              onClick={() => {
                navigator.clipboard.writeText('4100280000001007');
                setNotice('📋 Copied Visa Domestic Card: 4100 2800 0000 1007');
              }}
            >
              Copy Visa (4100...)
            </Btn>
            <Btn
              small
              kind="ghost"
              onClick={() => {
                navigator.clipboard.writeText('6527658900001005');
                setNotice('📋 Copied RuPay Card: 6527 6589 0000 1005');
              }}
            >
              Copy RuPay
            </Btn>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12,
          }}
        >
          {(cat?.plans ?? []).map((p) => (
            <div
              key={p.key}
              style={{
                border: `1px solid ${p.current ? C.accent : C.border}`,
                background: p.current ? C.panel2 : 'transparent',
                borderRadius: 10,
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '1.05rem' }}>
                  {p.key}
                </span>
                {p.current && <Badge value="active" />}
              </div>

              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {p.pricePaise === 0 ? 'Free' : formatINR(p.pricePaise)}
                </span>
                {p.pricePaise > 0 && (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}> / month</span>
                )}
              </div>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: '1.1rem',
                  color: C.muted,
                  fontSize: '0.8rem',
                  lineHeight: 1.7,
                }}
              >
                <li>{plural(p.limits.maxCompanies, 'company', 'companies')}</li>
                <li>{plural(p.limits.maxUsers, 'user', 'users')}</li>
                <li>{plural(p.limits.maxInvoicesMonth, 'invoice', 'invoices')} / month</li>
                <li>{plural(p.limits.ocrPagesMonth, 'OCR page', 'OCR pages')} / month</li>
                <li>{n(p.limits.aiTokensMonth)} AI tokens / month</li>
              </ul>

              <div style={{ marginTop: 'auto' }}>
                {p.current ? (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}>Your current plan</span>
                ) : p.key === 'free' ? (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}>
                    Downgrades are handled by support
                  </span>
                ) : p.subscribable ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Btn small onClick={() => void subscribe(p)} disabled={busy !== null}>
                      {busy === p.key ? 'Opening Razorpay…' : `Subscribe with Razorpay`}
                    </Btn>
                    <Btn
                      small
                      kind="ghost"
                      onClick={() => void directTestSubscribe(p)}
                      disabled={busy !== null}
                    >
                      ⚡ Instant Test Card Subscribe
                    </Btn>
                  </div>
                ) : (
                  <span style={{ color: C.amber, fontSize: '0.78rem' }}>
                    {p.configured ? 'Razorpay keys missing' : 'No Razorpay plan id configured'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0, marginTop: 12 }}>
          Only the org owner can subscribe. Hitting a limit returns 402 carrying the upgrade path,
          and limits are copied onto the organization when the plan activates.
        </p>
      </Card>
    </div>
  );
}
