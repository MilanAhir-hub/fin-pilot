import React from 'react';
import type { IFeature } from '../types';

export const featuresData: IFeature[] = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          stroke="url(#fp-grad-1)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="fp-grad-1" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff8c42" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'AI Copilot with Grounding',
    description:
      'The model queries 24+ read-only tools against your double-entry ledger and drafts human-confirmed actions with zero hallucinated math.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
          stroke="url(#fp-grad-2)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m9 12 2 2 4-4"
          stroke="url(#fp-grad-2)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="fp-grad-2" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff7744" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'GST & IMS Reconciliation',
    description:
      'Auto-reconcile supplier invoices under the Indian IMS portal. Prevent deemed acceptance and claim 100% of rightful ITC without manual audits.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
          stroke="url(#fp-grad-3)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="14 2 14 8 20 8"
          stroke="url(#fp-grad-3)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="16"
          y1="13"
          x2="8"
          y2="13"
          stroke="url(#fp-grad-3)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="17"
          x2="8"
          y2="17"
          stroke="url(#fp-grad-3)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="fp-grad-3" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff8c42" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'OCR Document Capture',
    description:
      'Snap smartphone photos of vendor bills or upload GST PDFs. OCR extracts line items into confident draft journal entries for your 1-click approval.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line
          x1="12"
          y1="20"
          x2="12"
          y2="10"
          stroke="url(#fp-grad-4)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="20"
          x2="18"
          y2="4"
          stroke="url(#fp-grad-4)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="6"
          y1="20"
          x2="6"
          y2="16"
          stroke="url(#fp-grad-4)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="fp-grad-4" x1="6" y1="4" x2="18" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff8c42" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'Monte Carlo Cash Forecast',
    description:
      'Deterministic 13-week Monte Carlo simulations (P10/P50/P90). Know your exact cash runway weeks in advance with real-time anomaly detection.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="3"
          stroke="url(#fp-grad-5)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="7"
          y1="8"
          x2="17"
          y2="8"
          stroke="url(#fp-grad-5)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="7"
          y1="12"
          x2="13"
          y2="12"
          stroke="url(#fp-grad-5)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="fp-grad-5" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff7744" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'GST-Compliant Invoicing',
    description:
      'Generate gapless e-invoices with automated tax splits, QR verification codes, and full Schedule III financial reporting classification.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="2"
          y="5"
          width="20"
          height="14"
          rx="2"
          stroke="url(#fp-grad-6)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="2"
          y1="10"
          x2="22"
          y2="10"
          stroke="url(#fp-grad-6)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="fp-grad-6" x1="2" y1="5" x2="22" y2="19" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff8c42" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'Multi-Bank Auto Matching',
    description:
      'Import statements from major Indian banks with cryptographic fingerprinting, duplicate detection, and scored 1-click match suggestions.',
  },
];
