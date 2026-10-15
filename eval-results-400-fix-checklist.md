# Eval results 400 Bad Request — fix checklist

Period `5a01886e-4eb9-4cf9-84d1-c314f610bb59` has 1318 SUBMITTED evals.
Single `.in(...)` with 1318 UUIDs ≈ 48KB URL → PostgREST 400 → route 500.

- [x] Diagnose: Vercel log `{ message: 'Bad Request' }` + count 1318
- [x] Slice 1: chunk `fetchRatingsWithCategories` (`lib/db/common.ts`) to 100/chunk
- [x] Slice 2: chunk `compute()` bulk `.in()` (`features/evaluation-results/evaluation-results.repository.ts:76-83`, fallback chain `:101-139`)
- [x] Slice 3: chunk `listLiveDeptAverages()` bulk `.in()` (`:273-276`, fallback chain `:288-324`)
- [x] Slice 4: chunk `listSubmittedWithSentiment` / `listRatingsBy*` / `listCommentsBy*` (`features/evaluations/evaluations.repository.ts:382-520`)
- [x] Slice 5: enrich `console.error` + `logServerError` with `code/hint/details` so next 400 names the table
- [ ] Verify: `npx vitest run lib/__tests__/evaluation` + repro curl for period `5a01886e...` returns 200
