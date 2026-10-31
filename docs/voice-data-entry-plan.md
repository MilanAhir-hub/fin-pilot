# Voice data entry — feasibility and plan

**Status:** proposal, not started
**Date:** 2026-10-31
**Scope:** speaking to FinPilot instead of typing — dictation first, voice-driven document drafting second

---

## 1. The short answer

Yes, and FinPilot is unusually well placed for it — because the hard part is already built.

The risk with voice in an accounting system is not transcription, it is **what happens after a
mis-transcription**. "Fifteen" and "fifty" are one noisy room apart, and under **I4 a posted journal
entry is immutable** — the only correction is a reversing entry. So any design that lets a transcript
reach the ledger directly is wrong.

FinPilot already forbids that. **I10 — the AI proposes, a human confirms.** Write tools return a
`proposal`; the UI renders a diff; a human clicks Confirm; only then does the server execute. Voice
does not need a new trust model, because it inherits this one. Voice becomes *another way to reach a
tool that already exists*, and the confirmation step that protects typed AI input protects spoken
input unchanged.

That is the whole argument for building it, and the whole constraint on how.

---

## 2. What this is not

Stating the boundary first, because it determines every decision below.

| Not building | Why |
|---|---|
| Voice that posts entries directly | Violates I10. Accents, homophones and background noise make a wrong amount routine, and I4 makes a wrong posting permanent. |
| A wake word / always-listening mic | A finance app has no business holding an open microphone. Press to talk, release to stop. |
| Voice as the only path | Every voice affordance must degrade to the existing typed form. Browser speech support is not universal (§6). |
| Replacing the invoice form | Voice fills a draft. The form stays the source of truth and the place corrections happen. |

---

## 3. Phase 1 — Dictation into the Copilot

**Effort:** 1–2 days · **Backend work:** none · **Cost:** ₹0 · **Risk:** low

Add a microphone button beside the Copilot input. Press and hold (or toggle) to dictate; the
transcript lands in the text box; the user reads it and presses Send.

- Browser `SpeechRecognition` / `webkitSpeechRecognition`, `lang: 'en-IN'`, `interimResults: true`
  so the user sees words appear and can tell it is working.
- The transcript is **editable before sending** — this is the entire safety story of Phase 1. Nothing
  reaches the server that the user has not read.
- The existing Copilot pipeline is untouched: same `POST /ai/conversations/:id/messages`, same tools,
  same I9 grounding validation on the way back.

**Where it goes:** `apps/web/src/features/copilot/CopilotPage.tsx`, beside the existing input. The
send button is already a real submit (`type="submit"`), so Enter continues to work for typists.

**Why this phase first:** it is a day of work, it is visibly useful, and it proves the interaction is
comfortable before anything is invested in accuracy. If people do not like talking to the app, we
learn that for one day's cost.

---

## 4. Phase 2 — Voice to proposal

**Effort:** 3–5 days · **Backend work:** small · **Risk:** medium

> "Raise an invoice for Gujarat Packaging, fifteen thousand rupees, web design, eighteen percent GST."

The transcript goes to the Copilot exactly as a typed message would. The model calls the existing
`proposeInvoice` tool. The tool returns a proposal. The UI renders the draft. The user confirms.

Nothing new is trusted. The spoken sentence has the same standing as a typed one.

**What has to be built**

1. **Proposal persistence.** This is the real dependency, and it is a gap today, not a voice problem:
   `propose()` in `apps/api/src/ai/registry.ts` returns a generated `proposalId` and persists nothing,
   `GET /ai/proposals` returns a hardcoded empty list, and `POST /ai/proposals/:id/confirm` and
   `/reject` throw `404` unconditionally. The `AiProposal` model exists and is referenced nowhere.
   **Voice is not worth building until this is finished**, because the confirm step *is* the safety
   model.
2. **A confirmation UI worth trusting.** Field-by-field diff, amounts shown with `formatINR`, the
   matched party named in full. The user is checking a machine's hearing — the screen must make an
   error obvious, not plausible.
3. **Party matching against real data.** Never trust the transcript for a name. Match the spoken name
   against the company's existing `Party` records and show which one was chosen; if the match is
   ambiguous, ask rather than guess.

**Sequencing note:** Phase 2 delivers nothing until proposal persistence lands. Treat that as its
first task, not a prerequisite someone else will do.

---

## 5. Phase 3 — Accuracy for Indian financial speech

**Effort:** 3–4 days · **Risk:** medium

Browser speech recognition is tuned for general English. It mishears the vocabulary this product is
made of.

| Spoken | Browser STT typically gives | Wanted |
|---|---|---|
| "pandrah hazaar" | "pandra hazar" | `1500000` paise |
| "two lakh fifty thousand" | "two lack fifty thousand" | `25000000` paise |
| "one point five crore" | "1.5 crore" | `15000000000` paise |
| "GSTIN 24AABCU…" | letters split and mangled | a validated GSTIN |
| Vendor names | phonetic approximations | a real `Party` record |

**Two fixes, in order:**

1. **A number normaliser** (`packages/shared`, so the client and server agree): Indian number words →
   integer paise. Handles lakh/crore, Hindi-English mixing, "rupees"/"rs", and decimals. Pure
   function, unit-testable, no model involved — this alone removes most amount errors. It must emit
   **integer paise** per I1; no floats anywhere in the path.
2. **Server-side STT for hard audio.** Gemini already accepts audio input and is already wired in
   (`GEMINI_API_KEY`), so this adds no new vendor and no new key. Send the clip, get a transcript with
   financial context in the prompt. Browser STT stays the fast path; the server is the fallback when
   confidence is low.

**Never** let the model invent an amount. The normaliser produces the number; the model only decides
which tool to call. This keeps I9 intact — every figure stays traceable.

---

## 6. Risks and constraints

| Risk | Reality | Mitigation |
|---|---|---|
| **Browser support** | `SpeechRecognition` is Chrome/Edge; Firefox has none, Safari is partial. | Feature-detect. Hide the mic where unsupported — never show a button that cannot work. The typed box is always present. |
| **Mic permission denied** | A hard failure with no warning if unhandled. | Catch it, explain it once, fall back to typing silently afterwards. |
| **Browser STT sends audio to a vendor** | Chrome's implementation is cloud-backed. For an accounting app this is worth stating plainly. | Document it. Offer server-side STT (Phase 3) as the controllable path, and keep voice opt-in. |
| **Noisy offices** | The realistic deployment environment for an SME. | Press-to-talk, not always-on. Show the interim transcript so the user sees trouble immediately. |
| **Gemini free-tier quota** | Already observed in production logs: `429 You exceeded your current quota`. | Voice must degrade to dictation-only when the LLM is unavailable, not break. |
| **Accessibility** | Voice helps some users and excludes others. | Additive only. No function becomes voice-only. |

---

## 7. What ships when

| Phase | Deliverable | Depends on | Effort |
|---|---|---|---|
| 1 | Dictation into the Copilot box | nothing | 1–2 days |
| 2a | Proposal persistence + confirm/reject inbox | — | 2–3 days |
| 2b | Voice → invoice proposal → confirm | 2a | 2 days |
| 3 | Indian number normaliser + server STT fallback | 2b | 3–4 days |

Phase 1 is independently shippable and worth doing on its own. Phase 2 is the feature people mean
when they say "voice data entry", and it is blocked on work (2a) that should happen regardless,
because the AI write flow is incomplete without it.

---

## 8. How this respects the invariants

Voice touches the most dangerous part of the system, so the mapping is worth being explicit about.

- **I1 — money is integer paise.** The normaliser emits paise directly. No float ever represents an
  amount, spoken or typed.
- **I4 — postings are append-only.** Voice never reaches a posting. It reaches a draft.
- **I5 — server-authoritative amounts.** A spoken total is treated exactly like a client-sent total:
  the server recomputes and ignores it.
- **I8 — tenant isolation.** Voice goes through the same tools, which run through the tenant plugin.
  A spoken company name cannot change which books are read — `executeTool` overwrites any
  `companyId` with the server's.
- **I9 — no unretrieved numbers.** The grounding validator is unchanged and still runs on every reply.
- **I10 — human confirms.** The whole design rests on this. It is the reason voice is safe here and
  would not be safe in a system without it.

---

## 9. Recommendation

Build **Phase 1 now** — it is a day, it needs no backend change, and it makes the Copilot noticeably
nicer to use.

Treat **Phase 2a (proposal persistence)** as the next real piece of work whether or not voice
proceeds: the AI write path is advertised in the UI and currently cannot complete, which is a gap
independent of this feature.

Hold **Phase 3** until there is evidence people actually dictate amounts rather than just questions.
"What is my revenue" needs no number normaliser; "raise an invoice for two lakh fifty thousand" does.
Measure which one people say before building for the second.
