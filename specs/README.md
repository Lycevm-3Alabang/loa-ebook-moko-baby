# LOA Connect Hub — Specs

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-08-24

---

# Purpose

This directory contains specs for the e-consultation app's integration with the loa-auth-platform. Each spec is a focused, versioned document. Specs must be Final before code is written (per loa-apache-server-apps convention).

---

# Spec Index

| Spec | Status | Purpose |
|------|--------|---------|
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
