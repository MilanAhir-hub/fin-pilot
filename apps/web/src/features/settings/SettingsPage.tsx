import { useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Row, S, Tbl, useLoad } from '../../lib/ui';

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

interface Catalogue {
  currentPlan: string;
  status: string;
  razorpayKeyId?: string;
  razorpayConfigured: boolean;
}

export function SettingsPage({
  company,
  user,
  onGoBilling,
}: {
  company: {
    id?: string;
    legalName: string;
    tradeName?: string;
    stateCode: string;
    gstin?: string;
    pan?: string;
    booksBeginDate?: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  onGoBilling: () => void;
}) {
  const billing = useLoad(() => api<Billing>('GET', '/api/v1/billing'));
  const catalogue = useLoad(() => api<Catalogue>('GET', '/api/v1/billing/plans'));

  const b = billing.data;
  const cat = catalogue.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Subscription & Plan Status */}
      <Card title="Subscription & Plan">
        <Err error={billing.error} />
        {b && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                background: 'var(--panel-2)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Current Active Plan
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, textTransform: 'capitalize', color: C.accent }}>
                    {b.plan}
                  </div>
                </div>
                <Badge value={b.status} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    fontSize: '0.78rem',
                    color: C.muted,
                  }}
                >
                  <span>Gateway: <strong>Razorpay</strong></span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                    {cat?.razorpayKeyId || 'rzp_test_TNdoTB3rZAZO4l'}
                  </span>
                </div>
                <Btn small kind="primary" onClick={onGoBilling}>
                  Manage Plan / Upgrade
                </Btn>
              </div>
            </div>

            <Tbl
              head={['Quota / Feature', 'Current Usage', 'Plan Limit']}
              rows={[
                ['Monthly Invoices', `${b.usage.invoices.toLocaleString('en-IN')}`, `${b.limits.maxInvoicesMonth.toLocaleString('en-IN')}`],
                ['Monthly AI Tokens', `${b.usage.aiTokens.toLocaleString('en-IN')}`, `${b.limits.aiTokensMonth.toLocaleString('en-IN')}`],
                ['Monthly OCR Pages', `${b.usage.ocrPages.toLocaleString('en-IN')}`, `${b.limits.ocrPagesMonth.toLocaleString('en-IN')}`],
                ['Allowed Users', '-', `${b.limits.maxUsers} seats`],
                ['Allowed Companies', '-', `${b.limits.maxCompanies} companies`],
              ]}
            />
          </div>
        )}
      </Card>

      {/* 2. Company Profile */}
      <Card title="Company Profile">
        <Tbl
          head={['Field', 'Value']}
          rows={[
            ['Legal Name', company.legalName],
            ['Trade Name', company.tradeName || '—'],
            ['GSTIN', company.gstin || 'Not registered / exempt'],
            ['PAN', company.pan || '—'],
            ['State Code', `${company.stateCode} (India)`],
            ['Books Begin Date', company.booksBeginDate ? company.booksBeginDate.slice(0, 10) : '—'],
          ]}
        />
      </Card>

      {/* 3. User Account */}
      <Card title="User Account">
        <Tbl
          head={['Account Property', 'Details']}
          rows={[
            ['Full Name', user.name],
            ['Email Address', user.email],
            ['Account Role', 'Organization Owner / Admin'],
          ]}
        />
      </Card>
    </div>
  );
}
