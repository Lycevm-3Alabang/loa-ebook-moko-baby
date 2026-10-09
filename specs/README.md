# ACES — Specs

**Version:** 1.1
**Status:** Draft
**Last Updated:** 2026-10-09

---

# Purpose

This directory contains specs for the e-consultation app's integration with the loa-auth-platform,
plus feature specs for the admin data importers. Each spec is a focused, versioned document.
Specs must be Final before code is written (per loa-apache-server-apps convention).

---

# Spec Index

| Spec | Status | Purpose |
|------|--------|---------|
| [faculty-import-stepper.md](faculty-import-stepper.md) | Draft | Decompose the faculty-subject CSV import into a per-phase stepper wizard — step registry, `StepResult` contract, idempotency and resume |
| [faculty-import-stepper/step-02-departments.md](faculty-import-stepper/step-02-departments.md) | Draft | Step 2 — create-if-absent departments, `name = code`, never discard a row |
| [faculty-import-stepper/step-03-courses.md](faculty-import-stepper/step-03-courses.md) | Draft | Step 3 — create-if-absent courses keyed by `(departmentId, code)` pair, `[unmapped]` name marker |
| [faculty-import-stepper/step-04-sections.md](faculty-import-stepper/step-04-sections.md) | Draft | Step 4 — upsert sections, `created`-driven classification, missing-course flagging |
| [faculty-import-stepper/step-05-subjects.md](faculty-import-stepper/step-05-subjects.md) | Draft | Step 5 — upsert subjects; documents the `name = code` fallback firing on all 315 |
| [faculty-import-stepper/step-06-faculty-users.md](faculty-import-stepper/step-06-faculty-users.md) | Draft | Step 6 — create missing faculty, dummy is dept-agnostic, off-domain never becomes a user |
| [faculty-import-stepper/step-07-mappings.md](faculty-import-stepper/step-07-mappings.md) | Draft | Step 7 — terminal step; `existing` vs `invalid`, real-beats-dummy, real-vs-real refused |
| [auth-integration.md](auth-integration.md) | Draft | Contract between e-consultation and loa-auth — SSO flow, JWT claims, shared secrets, what each side owns |
| [endpoint-catalog.md](endpoint-catalog.md) | Draft | Full endpoint catalog (~130 entries) with required levels — must stay in sync with loa-auth-platform |
| [migration-checklist.md](migration-checklist.md) | Draft | Step-by-step tasks for each side, verification checklist, timeline |

---

# Cross-References

| This spec | Corresponding doc in loa-apache-server-apps |
|-----------|---------------------------------------------|
| `auth-integration.md` | `assemblies/loa-consult-platform/consult-readiness.md` §3-5 |
| `endpoint-catalog.md` | `assemblies/loa-consult-platform/consult-readiness.md` §2.3-2.4 |
| `migration-checklist.md` | `assemblies/loa-consult-platform/consult-readiness.md` §6-7 |

---

# Convention

- Each spec has a `Version`, `Status` (Draft → Final), and `Last Updated` date
- Draft = open for discussion, not yet implemented
- Final = approved, code may be written to match it
- Changes to Final specs require a version bump and re-approval
