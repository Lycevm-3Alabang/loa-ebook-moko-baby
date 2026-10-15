---
skill: plan-fix
story: PDF header malformed on DEPARTMENT EVALUATION REPORT (logo/text overlap per screenshot)
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Revised header v4: logo left + LYCEUM OF ALABANG middle-aligned (vertical center) same row, address centered below + rule"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| reuse | Use last calibration 1A 2A 3B 4D 5A 6C? | Use it |
| header-option | Which fix? | Other: address under logo+name, larger logo right, school name opposite, show visual |
| header-v2 | Logo left or right? | Other: Logo on the left |
| header-v3 | Layout refine? | Other: logo and school name same row, under them is the address |
| header-v4 | Name alignment? | Other: name vertically middle-aligned with logo |
| plan-done | Is middle-aligned plan done? | Done |
| who-implements | Who implements this slice? | Code it |
| slice-1 | Apply header fix to lib/evaluation-pdf.ts? | Applied |
| center-group | Center logo+name as group? | Requested: group centered, address below |
| remove-name | Logo already has name? | Requested: remove separate school-name text |
| bigger-logo | Increase logo size? | Requested: increase size (32 → 42mm) |
| slice-2 | Apply logo-only centered + larger? | Applied |

## Pending

- none

## Pending

- none

## Pending

- handoff

## Pending

- plan-done

## Decisions

- Calibration reused: 1A 2A 3B 4D 5A 6C
- Layering order: Route Handler → Controller → Service → Repository → Supabase (client PDF gen sits outside; fix stays in lib helper)
- Gold paths read-first: lib/evaluation-pdf.ts (fix target); ReportModal.tsx + EvaluationDashboard.tsx as aspect-measure reference only
- Proof command: npm test (no header test exists; visual PDF check is proof)
- Invariants preserved: API thin / proxy / Supabase repos / SubmitButton / role-priority all n/a — header-only change in lib/evaluation-pdf.ts
- Approved layout v4: logo left larger (~30-35mm, measured aspect) + LYCEUM OF ALABANG same row middle-aligned + address centered below + rule + centered title

## Scan

```text
Path: downloadDeptPdf (lib/evaluation-pdf.ts:255) → addPdfHeader (lib/evaluation-pdf.ts:70) → doc.addImage line 83 + doc.text address line 91
Proof: none. Command: npm test
Teach: what — jsPDF addImage with h=0 auto-scales but code advances y by fixed 10mm; why — real logo height >10mm so address text lands inside logo image; when — every dept/individual PDF via lib/evaluation-pdf.ts; one alternative — hardcode larger gap (brittle vs measuring natural aspect like ReportModal does)
Lens:
- API routes stay thin: n/a — client-side PDF gen, no route touched
- proxy.ts access-enforcement: n/a — no auth path
- Supabase via repositories: n/a — no DB read
- SubmitButton double-click guard: n/a — export button, not form submit
- Role pipe-delimited priority: n/a — no role check in header
```

## Scan

## Plan

Slice 1 (only slice) — lib/evaluation-pdf.ts :: addPdfHeader:
- Left logo ~30-35mm wide at x=14, height from measured natural aspect (fixes fixed-10mm overlap)
- LYCEUM / OF ALABANG bold to right of logo, vertically middle-aligned with logo center
- Address (Main Bldg. Km. 30 National Road, Tunasan, Muntinlupa City) centered below max(logo bottom, name bottom)
- Rule 14→pageW-14 below address; return y below rule for title
- Covers portrait (individual) + landscape (dept per_subject/per_faculty); text-only fallback if logo fetch fails
- Out of scope: ReportModal/Dashboard duplicates, CSV, body tables, logo asset
