# SPIKE — Does the Enrollment-Gate Defect Apply to Consultation?

Status: investigation complete · Verdict: no · Companion to `spike-student-eval-enrollment-gate.md`
Scope of inquiry: does the `route.ts:98` enrollment-gate mismatch reach the consultation booking flow?

---

## 1. Question

The evaluation spike established that `student_enrollments` carries three denormalized
columns (`section_id`, `faculty_subject_id`, `semesterId`) that read and write paths consult
differently, producing a 403 on `POST /api/evaluations` for students with visible pending items.

**Does the same defect class reach consultation booking?**

---

## 2. Verdict

**No.** Consultation has no enrollment gate, so the predicate mismatch cannot occur there.

The defect's *cause* — however — does originate in a shared writer, and that writer is worth
auditing on its own merits.

---

## 3. Evidence

### 3.1 Consultation has no enrollment gate

| Search | Target | Result |
|---|---|---|
| `enrollment\|student_enrollments\|semesterId` | `features/appointments/` | **no matches** |
| `enrollment\|Enroll\|semesterId\|studentEnroll` | `app/api/appointments/` | **no matches** |
| `availability\|Availability` | `app/api/appointments/route.ts` | only a role-guard 403 message |

The consultation slice does not read `student_enrollments` at all. Booking is gated on role
via `lib/route-guard.ts`, not on academic relationship. That is a deliberate design
difference — consultations are open across terms and departments — not an oversight.

### 3.2 The failing predicate has exactly two callers

`studentEnrollmentRepository.findExisting` is called from:

| Caller | Slice |
|---|---|
| `app/api/evaluations/route.ts:95` | evaluations |
| `app/api/evaluations/dispute/route.ts:41` | evaluations |

No third caller. The defect cannot escape the evaluations slice through this method.

---

## 4. What does carry over

The defect's *writer* is shared, and its column omissions have reach beyond evaluations.

### 4.1 `replaceBySection` writes incomplete rows

`features/admin-data/student-enrollment.repository.ts:15-22`:

```ts
const rows = items.map((i) => ({
  student_id: i.student_id,
  section_id,
  semesterId: i.semesterId ?? null,     // ← null when payload omits it
}))
// faculty_subject_id never written
```

Sole caller: `lib/services/etlEvaluation.ts:796`.

Consequences when the ETL payload omits `semesterId`:

- rows are invisible to `findExisting` (which matches `.eq("semesterId", …)` exactly)
- `findPending` Branch A (`evaluations.repository.ts:46-84`) queries `faculty_subject_id` and
  applies **no** semester filter, so those same rows still surface as pending
- net effect: pending list populates, submit 403s — the reported symptom

This is a plausible mechanism for the incident, but §4 of the companion spike is still the
only way to confirm it. Do not treat it as established.

### 4.2 Admin surfaces read the same rows

| Endpoint | Method | Effect of incomplete rows |
|---|---|---|
| `app/api/data/evaluation-mappings/route.ts:21` | `countBySectionIds` | student counts skewed |
| `app/api/data/evaluation-mappings/route.ts:32` | `listAllWithEmbeds` | missing faculty links in admin UI |
| `app/api/semesters/[id]/impacts/route.ts:27` | `countBySemesterId` | null-semester rows undercounted |
| `app/api/admin/users/[id]/related-data/route.ts:22` | `list({student_id})` | unfiltered; gaps visible per user |

None of these gate a student action. All are reporting surfaces, and all degrade quietly
rather than erroring.

### 4.3 `LockedTab` misleading text

`components/ui/LockedTab.tsx:17` hardcodes *"This tab requires the ADMIN role…"* for any 403,
regardless of actual role. Not evaluation-specific — any consulted page rendering `LockedTab`
on a 403 will display it. This misdirected the investigation twice before the HAR settled it.

---

## 5. Options

| Option | Change | Pros | Cons |
|---|---|---|---|
| A | Fix `replaceBySection` to write `faculty_subject_id` and reject/flag null `semesterId` | Addresses the shared cause; both evaluation call sites heal; prevents recurrence on next import | Needs a decision on what to do with payload rows lacking `semesterId` |
| B | Relax both readers (`route.ts:95`, `dispute/route.ts:41`) to be semester-tolerant | Local, two call sites | Leaves the writer producing unusable rows for the next import |
| C | Harden read/write into one shared predicate, plus audit Branch A's missing semester filter | Eliminates the class | Conflates two defects; largest blast radius |

**Recommendation: A**, contingent on the companion spike's §4 query. If that query shows
`semesterId` NULL across enrollment rows, the writer is the root cause and A supersedes B.
If it shows a populated-but-divergent `semesterId`, the trigger is upstream in the ETL payload
and neither A nor B addresses it.

---

## 6. Limits of this spike

Stated so the verdict is not over-read:

- Consultation was checked by grep for enrollment-related identifiers across
  `features/appointments/` and `app/api/appointments/`. It was **not** traced end-to-end
  through the booking flow line by line. A booking path that reaches enrollment data under a
  different naming convention would have been missed.
- No consultation-side HAR or reproduction was available. The verdict rests on static
  structure, not observed traffic.
- Whether consultation booking *should* enforce enrollment is a product question, not a bug
  question, and is not addressed here. Current behaviour (open booking) is internally
  consistent.

---

## 7. Status

| Item | State |
|---|---|
| Consultation affected by the gate mismatch | No — no enrollment gate exists |
| Shared writer identified as suspect | Yes — `replaceBySection`, sole caller `etlEvaluation.ts:796` |
| Trigger confirmed | Blocked on companion spike §4 |
| Code changed | None |
