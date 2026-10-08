refined: true
Stack: TypeScript, Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase PostgreSQL, NextAuth v4
Tests: npm test
Issue tracker: user text only
Layering: Route Handler → Controller → Service → Repository → Supabase
Invariants:
- API routes stay thin (parse, call controller, return JSON) — app/api/ — CLAUDE.md/README.md name the layered pattern
- proxy.ts is the access-enforcement point (JWT + DB role + tokenVersion) — proxy.ts — CLAUDE.md §Access Control
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — CLAUDE.md §Data Access
- Double-click prevention via SubmitButton — components/ui — CLAUDE.md Key Conventions
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — CLAUDE.md §Access Control
Gold paths:
- app/api/, features/, proxy.ts, lib/auth.ts, lib/repositories/factory.ts
Sources:
- package.json, README.md, AGENTS.md, CLAUDE.md, .github/workflows/test.yml
