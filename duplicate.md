# Codebase Dead Code & Redundancy Audit (`duplicate.md`)

This document records all dead, unreferenced, or redundant files, assets, and package dependencies identified across the **FinPilot** codebase.

---

## Executive Summary

| Category                            | Item Count |     Estimated Size / Impact      | Status                                                      |
| :---------------------------------- | :--------: | :------------------------------: | :---------------------------------------------------------- |
| **Unused Source Code Components**   |  2 files   |       ~6.2 KB (196 lines)        | Orphaned after dashboard navigation cleanup                 |
| **Dead Root / Mock Files**          |   1 file   |             449.3 KB             | Stale HTML mock file not connected to build                 |
| **Unreferenced Public Assets**      |  16 files  |             ~5.51 MB             | Leftover crops & unused design mockups in `apps/web/public` |
| **Unused / Redundant Dependencies** | 5 packages | Reduced `node_modules` footprint | Installed packages not imported in codebase                 |
| **Unused Internal API Exports**     | 3 symbols  |              Minor               | Exported functions/limiters never consumed                  |

---

## 1. Unused Source Code Files (Components & Pages)

These files are completely detached from the application tree—no file in `apps/web/src`, `apps/api/src`, or `packages/shared/src` imports or references them.

### 1.1 `apps/web/src/features/platform/NotificationsPage.tsx` & Backend Models (DELETED)

- **Status:** **Deleted & Cleaned Up**
- **Action Taken:** Removed orphaned `NotificationsPage.tsx`, backend model `Notification.ts`, routes, service, and dropped `notifications` & `notificationpreferences` collections from MongoDB.
- **AdminAudit Model (DELETED):** Removed redundant `AdminAudit.ts` and dropped `adminaudits` collection from MongoDB. Super-admin platform actions (impersonation, plan changes, operator grants) now log directly to standard application structured logs (`logger.info`).
- **AiProposal & AiToolCall Models (DELETED):** Removed `AiProposal.ts` and `AiToolCall` model from `AiConversation.ts`, dropped `aiproposals` and `aitoolcalls` collections from MongoDB. Tools execute directly and streamline grounded copilot reasoning without redundant database write overhead.
- **DeadLetter Model (DELETED):** Removed `DeadLetter.ts` and dropped `deadletters` collection from MongoDB. Background worker job retries and failed states are natively managed by BullMQ in Redis without duplicate persistence in MongoDB.
- **ImpersonationSession Model (DELETED):** Removed `ImpersonationSession.ts` and dropped `impersonationsessions` collection from both MongoDB Atlas and local instances. Support impersonation sessions are now verified statelessly via signed short-lived JWTs (`claims.imp = { by, sid }`) and audited directly in ledger `AuditLog` entries and logger streams without continuous database write overhead on every request.

### 1.2 [`apps/web/src/features/platform/MembersPage.tsx`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/src/features/platform/MembersPage.tsx)

- **Lines of Code:** 89 lines
- **Size:** ~2.7 KB
- **Reason:** In previous turn, the user requested removing the "Team" / "Members" option from the dashboard. The route and sidebar link were removed from `App.tsx`, leaving `MembersPage.tsx` with **zero incoming imports**.
- **Recommendation:** Safe to delete if team management is not needed in the web dashboard, or archive for future team invite workflows.

---

## 2. Dead Root / Static Mock Files

### 2.1 [`FinPilot Dashboard.html`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/FinPilot%20Dashboard.html)

- **Location:** Project root (`./FinPilot Dashboard.html`)
- **Size:** 449.3 KB (392 lines of minified/bundled markup)
- **Reason:** A standalone offline bundled preview/mock HTML file. It is not served by Vite, not referenced in `apps/web/index.html`, not referenced in `apps/api/src/server.ts`, and not tracked in any build pipeline or script.
- **Recommendation:** Safe to delete or move to an external reference folder.

---

## 3. Unreferenced Public Assets (`apps/web/public`)

Out of **19 asset files** located in `apps/web/public`, **16 files are dead** (never referenced in any JSX, TSX, CSS, HTML, or TS file). Only **3 files** are actively used.

### Dead Assets Breakdown (~5.51 MB total wasted space)

| File Path                                                                                                                                                                                  | File Size | Description & Reason                                        |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: | :---------------------------------------------------------- |
| [`apps/web/public/hero-bg.jpg`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/hero-bg.jpg)                                                         |  710 KB   | Unused background image. Replaced by CSS radial gradients.  |
| [`apps/web/public/assets/finpilot_dark_hero.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/finpilot_dark_hero.png)                     |  710 KB   | Intermediate dark hero mockup iteration.                    |
| [`apps/web/public/assets/hero_dark_theme.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/hero_dark_theme.png)                           |  550 KB   | Early dark theme hero mockup iteration.                     |
| [`apps/web/public/assets/stage_cutout_clean.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/stage_cutout_clean.png)                     |  470 KB   | Intermediate crop iteration from hero visual design.        |
| [`apps/web/public/assets/full_stage_crop.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/full_stage_crop.png)                           |  450 KB   | Intermediate crop iteration from hero visual design.        |
| [`apps/web/public/assets/crop_full.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/crop_full.png)                                       |  430 KB   | Experimental crop preview file.                             |
| [`apps/web/public/assets/people_and_laptop.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/people_and_laptop.png)                       |  430 KB   | Intermediate background removal experiment.                 |
| [`apps/web/public/assets/finpilot_hero_cutout_perfect.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/finpilot_hero_cutout_perfect.png) |  430 KB   | Unused cutout experiment.                                   |
| [`apps/web/public/assets/card_crop_with_laptop.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/card_crop_with_laptop.png)               |  410 KB   | Unused crop asset.                                          |
| [`apps/web/public/assets/crop_preview.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/crop_preview.png)                                 |  380 KB   | Unused temporary crop preview.                              |
| [`apps/web/public/assets/finpilot_hero_people.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/finpilot_hero_people.png)                 |  300 KB   | Unused people cutout asset.                                 |
| [`apps/web/public/assets/people_cutout.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/people_cutout.png)                               |  300 KB   | Unused people cutout asset.                                 |
| [`apps/web/public/assets/rembg_full_card.png`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/rembg_full_card.png)                           |  300 KB   | Background removal intermediate artifact.                   |
| [`apps/web/public/assets/footer-logo.svg`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/footer-logo.svg)                                   |   10 KB   | Unused SVG asset. Footer renders its own inline brand logo. |
| [`apps/web/public/assets/logo.svg`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/logo.svg)                                                 |   10 KB   | Unused SVG asset. Navbars render inline SVG mark.           |
| [`apps/web/public/assets/background-splash.svg`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/public/assets/background-splash.svg)                       |   4 KB    | Unused vector splash.                                       |

> **Active Assets (DO NOT DELETE):**
>
> - `apps/web/public/assets/hero-section-showcase.png` (Used in `LandingPage.tsx`)
> - `apps/web/public/assets/features-showcase-1.png` (Used in `LandingPage.tsx`)
> - `apps/web/public/assets/features-showcase-2.png` (Used in `LandingPage.tsx`)

---

## 4. Unused & Redundant Package Dependencies

### 4.1 In [`apps/web/package.json`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/package.json)

1. **`hugeicons-react` (`^0.4.0`)**
   - **Reason:** Duplicate / defunct package. All icons in `apps/web/src` import from `@hugeicons/react` and `@hugeicons/core-free-icons`. `hugeicons-react` is not imported anywhere.
2. **`@fontsource-variable/inter` (`^5.3.0`)**
   - **Reason:** Never imported in `main.tsx` or `index.css`. The application loads Google Fonts directly via `<link>` in `apps/web/index.html`.
3. **`@fontsource-variable/plus-jakarta-sans` (`^5.3.0`)**
   - **Reason:** Never imported. Loaded via Google Fonts CDN in `index.html`.
4. **`@fontsource/ibm-plex-mono` (`^5.3.0`)**
   - **Reason:** Never imported. Loaded via Google Fonts CDN in `index.html`.

### 4.2 In [`apps/api/package.json`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/package.json)

1. **`docx` (`^9.7.1`)**
   - **Reason:** Listed under `dependencies` in `apps/api/package.json`, but never imported or referenced in any controller, service, route, or script.

---

## 5. Unused Internal Exported Symbols

These symbols are exported from their respective files but are never imported by any other module in the codebase:

| File Path                                                                                                                                              | Symbol Name       | Type               | Notes                                |
| :----------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- | :----------------- | :----------------------------------- |
| [`apps/api/src/integrations/limiters.ts`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/integrations/limiters.ts) | `groqLimiter`     | `const Bottleneck` | Exported rate limiter never imported |
| [`apps/api/src/integrations/limiters.ts`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/integrations/limiters.ts) | `razorpayLimiter` | `const Bottleneck` | Exported rate limiter never imported |
| [`apps/api/src/jobs/reportExport.ts`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/jobs/reportExport.ts)         | `newReportJobId`  | `function`         | Utility ID generator never imported  |

---

## Summary of Potential Savings

- **Disk Space Savings:** ~6.0 MB (by removing unreferenced public image assets and root HTML mock).
- **Code Cleanliness:** Eliminates 2 unrouted React components (196 LOC) and cleans up 5 redundant npm dependencies.
