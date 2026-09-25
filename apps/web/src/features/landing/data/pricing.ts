import type { IPricing } from '../types';

export const pricingData: IPricing[] = [
  {
    name: 'Starter',
    price: 2499,
    period: 'month',
    features: [
      'Up to 1,000 ledger entries / mo',
      '1 GSTIN business entity',
      'AI Copilot ledger querying',
      'OCR scanner (150 bills/mo)',
      'Bank statement auto-match',
      'Schedule III standard chart',
    ],
    mostPopular: false,
  },
  {
    name: 'Business',
    price: 6999,
    period: 'month',
    features: [
      'Up to 10,000 ledger entries / mo',
      '3 GSTINs with multi-state filing',
      '1-Click GST IMS 2.0 reconciliation',
      'Unlimited OCR bill processing',
      '13-Week Monte Carlo cash forecast',
      'E-Invoicing with QR codes',
      'Exportable audit trails for CAs',
    ],
    mostPopular: true,
  },
  {
    name: 'Enterprise',
    price: 18999,
    period: 'month',
    features: [
      'Unlimited transaction volume',
      'Unlimited GSTINs & entities',
      'Custom Schedule III chart taxonomy',
      'Dedicated CA compliance advisor',
      'Tally & ERP bidirectional sync',
      'Custom role-based access control',
      '99.99% uptime SLA & audit guarantee',
    ],
    mostPopular: false,
  },
];
