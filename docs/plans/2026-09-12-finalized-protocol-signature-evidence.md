# Finalized Protocol Signature Evidence Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every finalized protocol PDF faithfully render a safely validated captured signature image and replace unsupported cryptographic/legal-binding claims with precise source-bound evidence language.

**Architecture:** Extend the existing pure `FinalizedProtocolReport` view model with a normalized optional signature image. One validator accepts only canonical PNG/JPEG base64 data URIs within explicit 256 KiB decoded image-file byte, 2048-pixel per-dimension, 2,097,152-pixel canvas, 8-bit PNG, inflated-scanline, decoded-output, and 32 MiB JPEG-decoder-memory bounds. It validates every PNG chunk CRC and the zlib Adler checksum, performs bounded PNG inflation with `fflate`, and fully decodes PNG/JPEG image content with `fast-png` / `jpeg-js` before `AuditReportPDF` can receive it. Existing fresh and persisted report builders remain the single boundary used by dashboard, Protocol Register, and Case dossier PDF generation; localization/README changes align product claims with the delivered assurance.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@react-pdf/renderer`, SignaturePad, `fast-png`, `fflate`, `jpeg-js`, Vitest, React Testing Library.

---

### Task 1: Define and render safe signature evidence

**Objective:** Add the pure signature-image contract and make the shared finalized PDF render it with a truthful fallback.

**Files:**
- Modify: `lib/protocol-report.ts`
- Modify: `components/dashboard/AuditReportPDF.tsx`
- Test: `__tests__/protocol-report.test.ts`
- Test: `__tests__/audit-report-pdf.test.tsx`

**Step 1: Write failing contract tests**

Add focused tests proving that:
- a small `data:image/png;base64,...` value is preserved as `signatureImageData`
- `data:image/jpeg;base64,...` is accepted
- SVG, remote URLs, malformed/padded payloads, and payloads above the explicit byte limit become `null`
- corrupt PNG CRC/Adler data, truncated decoder input, 16-bit PNG, and images beyond the pixel/dimension/decode-memory envelope are rejected
- a typical high-DPI 2048 × 1024 SignaturePad canvas remains accepted at the exact pixel boundary
- a non-empty unsafe historical value can remain truthfully `signatureCaptured: true` while its image is unavailable for rendering

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/protocol-report.test.ts`

Expected: FAIL because `signatureImageData` and the validator do not exist.

**Step 3: Implement the minimal pure contract**

Add exported byte, per-dimension, pixel, PNG inflated-scanline, decoded-output, and JPEG decoder-memory limits. The validator/normalizer accepts only exact PNG/JPEG base64 data URIs with canonical base64 length/padding, verifies every PNG chunk CRC plus the zlib Adler checksum, performs bounded PNG inflation with `fflate`, rejects PNG bit depths above 8, and performs strict full image decoding with `fast-png` / `jpeg-js`. Extend `FinalizedProtocolReport` with `signatureImageData: string | null`; allow `FinalizedProtocolReportInput` to receive `signatureData?: string | null`; derive the normalized image in both report builders while preserving the existing captured-state semantics for historical non-empty data.

**Step 4: Write failing PDF tests**

Extend `__tests__/audit-report-pdf.test.tsx` to inspect the React element tree and prove:
- a valid normalized signature produces one PDF image node with that source
- captured-but-unrenderable data produces explicit truthful fallback text and no image
- missing signature produces the existing missing state and no image

**Step 5: Implement the minimal PDF rendering**

Import the PDF `Image` primitive, add a bounded signature block/style, render `report.signatureImageData` only when non-null, and distinguish the captured-but-unavailable fallback from not captured. Do not redesign unrelated PDF content.

**Step 6: Run focused tests**

Run: `npm run test -- __tests__/protocol-report.test.ts __tests__/audit-report-pdf.test.tsx`

Expected: PASS.

**Step 7: Commit**

```bash
git add lib/protocol-report.ts components/dashboard/AuditReportPDF.tsx __tests__/protocol-report.test.ts __tests__/audit-report-pdf.test.tsx
git commit -m "feat: embed safe signature evidence in protocol PDFs"
```

### Task 2: Wire fresh finalization into the shared report contract

**Objective:** Ensure the immediate post-finalization PDF receives the same captured image already persisted for later regeneration.

**Files:**
- Modify: `app/dashboard/page.tsx`
- Test: `__tests__/dashboard-protocol.test.ts`

**Step 1: Write a failing wiring test**

Add focused behavior regressions with a small valid PNG proving all three PDF paths receive the exact normalized image as `report.signatureImageData`: the fresh immediate post-finalization download, persisted regeneration from the Protocol Register, and persisted regeneration from the Case dossier. For the fresh path, prove that `buildFinalizedProtocolReport` receives the exact SignaturePad data URI used for persistence and preserve the existing pending-finalization locks without creating a second canvas read.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/dashboard-protocol.test.ts`

Expected: FAIL because the fresh report builder currently receives only `signatureCaptured`.

**Step 3: Implement the minimal wiring**

Capture the SignaturePad data URI once per finalization attempt, reuse it for the authenticated insert and the in-memory report, and pass it as `signatureData`. Preserve existing behavior when persistence is unavailable or finalization fails.

**Step 4: Run focused integration tests**

Run: `npm run test -- __tests__/dashboard-protocol.test.ts __tests__/protocol-report.test.ts __tests__/audit-report-pdf.test.tsx __tests__/protocol-register-page.test.tsx __tests__/cases-checklist-persistence.test.tsx`

Expected: PASS, demonstrating the fresh path plus Protocol Register and Case dossier regenerated-PDF paths each pass the exact normalized valid PNG to the mocked `AuditReportPDF` report while retaining stale-completion, lock, ownership, and error assertions.

**Step 5: Commit**

```bash
git add app/dashboard/page.tsx __tests__/dashboard-protocol.test.ts
git commit -m "fix: retain signature image for immediate protocol export"
```

### Task 3: Align product signature claims with delivered guarantees

**Objective:** Remove unsupported cryptographic/legal-binding claims in all supported locales and repository-facing product documentation.

**Files:**
- Modify: `locales/index.ts`
- Modify: `README.md`
- Test: `__tests__/locales.test.ts`

**Step 1: Write failing semantic tests**

Add DE/FR/IT/EN checks for the landing evidence, handover feature, and post-finalization success strings. Assert each locale describes a captured signature/finalized record and does not claim cryptographic signing, qualified/legal validity, or secure external retention. Keep all translation keys present and semantically parallel.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/locales.test.ts`

Expected: FAIL on the current cryptographic/legal claims.

**Step 3: Replace the unsupported claims**

Update the affected existing keys in all four locales with concise language about captured signatures and source-bound finalized records. Update the README feature row to match. Do not claim signature identity verification, legal binding effect, PDF cryptography, delivery, acceptance, or external retention.

**Step 4: Run focused tests**

Run: `npm run test -- __tests__/locales.test.ts __tests__/metadata.test.ts __tests__/audit-report-pdf.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add locales/index.ts README.md __tests__/locales.test.ts
git commit -m "fix: align signature claims with captured evidence"
```

### Task 4: Integration review and required validation

**Objective:** Prove the complete approved slice is reviewable, source-bound, and regression-free.

**Files:**
- Modify if review requires: only files already listed above
- Update: `scripts/baucompliance-pipeline/decisions/2026-09-12.md`

**Step 1: Run the complete focused signature/export set**

Run: `npm run test -- __tests__/protocol-report.test.ts __tests__/audit-report-pdf.test.tsx __tests__/dashboard-protocol.test.ts __tests__/protocol-register-page.test.tsx __tests__/cases-checklist-persistence.test.tsx __tests__/locales.test.ts`

Expected: PASS.

**Step 2: Run required repository validation**

Run each separately:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all PASS. If any required command remains failing after isolation/retry, do not report the implementation as complete.

**Step 3: Product/security review**

Verify that:
- every PDF path consumes the same report contract
- the immediate post-finalization, Protocol Register, and Case dossier tests each assert that the exact valid normalized PNG reaches `report.signatureImageData`
- only validated bounded PNG/JPEG data reaches the PDF `Image`
- the actual captured image appears, not merely another boolean indicator
- unsupported cryptographic/legal/retention claims are gone from the touched user-facing surfaces
- no database, RLS, mutation, deadline, delivery, acceptance, or countersignature behavior changed

**Step 4: Record outcome and commit artifacts**

Update today's decision artifact with implementation, review, validation, and PR status. Stage only the approved product files, this plan, and today's proposal/decision artifacts, then commit with an appropriate conventional message.
