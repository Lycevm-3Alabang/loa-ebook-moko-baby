# Chunked Import — Failure UX and Timeout Policy

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-10-09

Sub-spec of both importer families. Covers the shared chunk driver
(`useChunkedImport`) and the two callers that drive it, so the fix lands once rather than twice.

---

# 1. Purpose

A failed import chunk currently tells the admin a status code and nothing else. The only way to
learn *why* is to open Vercel's runtime logs and read a 62 KB HTML error page keyed by an opaque
request id. This spec makes the failure legible in the product, and makes the platform's two
timeout knobs (`maxDuration` and the client's own timer) agree with each other.

It is diagnostic and presentational. **It does not fix the timeout** — that is
[step-03-enrollments.md](student-import-stepper/step-03-enrollments.md) §"Batched resolution",
which removes the ~22,000 sequential round trips that cause it.

---

# 2. The evidence this spec exists for

Observed on staging, 2026-10-09 20:20:12 +08, `POST /api/import/students`:

| Field | Value |
|---|---|
| Status | `504 FUNCTION_INVOCATION_TIMEOUT` |
| Execution Duration | 1m — finished at 62.8s |
| Route ceiling | `maxDuration = 60` (`app/api/import/students/route.ts:10`) |
| Ingress / region | sin1 → routed to iad1 |
| Request ID | `l52bm-1791548412231-449a95eddf79` |
| Supabase calls in-flight | ~66 GET, 6 POST |

The region split is the load-bearing detail: every Supabase call from that function is a
Singapore → US-East round trip.

---

# 3. Defects in the failure path

## F1 — Raw response bodies are interpolated into user-facing messages

`BulkStudentImport.tsx:328-335`:

```ts
try {
  data = await res.json()
} catch {
  const text = await res.text().catch(() => "")
  throw withRetryHints(new Error(`Chunk ${n} failed (${res.status}). ${text.slice(0, 200) || …`), res)
}
```

Two faults. The intent — show the server's reason — is right, but
`res.json()` on the line above has **already consumed the body**, so `res.text()` returns `""` and
the message degenerates to `Chunk 3 failed (504). No details available.` — a status code and no
reason. The raw-body path is also a live hazard: any non-JSON error body that *is* readable lands
in the UI verbatim, 200 characters of markup.

`FacultyLoadingTab.tsx:781-782` shows the correct shape — `await res.json().catch(() => ({}))`,
then read `d.error`. The two callers of the same hook diverge on error handling.

## F2 — Status is carried but never translated

`withRetryHints` already attaches `status` and `retryAfterMs` to the thrown error
(`useChunkedImport.ts:44-61`). Nothing consumes them. The admin sees `(504)` as a number; the retry
engine uses `status` but the *message* never does.

## F3 — A 504 is retried, and retrying it cannot work

`isRetryableChunkError` (`useChunkedImport.ts:70-75`) returns `true` for every `status >= 500`, and
`maxRetries` defaults to 2 (`:158`). A 504 means the function exhausted `maxDuration` on the work
it was given; re-running **the same chunk size** re-runs the same cost. One timeout becomes up to
three attempts × ~62 s ≈ 3 minutes of frozen UI ending in the identical failure.

This is different from a transient 500 or a 429, where a retry is genuinely likely to succeed and
must be kept.

## F4 — The client timer is not aligned to the route ceiling

`chunkTimeoutMs` defaults to `120000` (`useChunkedImport.ts:157`) while the route dies at 60 s.
The platform's 504 almost always wins, so the client's timer is dead weight — and when it does
fire it fires ~57 s after the request was already dead, on a stale timer that no longer reflects
reality.

## F5 — Failures never state the safety invariant

Chunks are additive and idempotent (general spec §6), so a failed chunk costs nothing and pressing
Import again resumes exactly where it stopped. That is the single most important thing an admin
needs to know at that moment, and no failure message says it.

## F6 — Not diagnosable without the Vercel dashboard

The 504's cause exists only in a runtime log line keyed by `Request ID`. Nothing in the UI carries
a key a developer can use. Meanwhile a durable key **already exists**: `fileId` is generated
per run and written to the audit trail on the final chunk (`app/api/import/students/route.ts:115-118`
and the faculty route's equivalent), so it resolves to a database row today.

## F7 — `String(data.error)` coerces blindly

`BulkStudentImport.tsx:335` wraps an `unknown` in `String(...)`. A server that ever returns
`{ error: { … } }` renders `[object Object]`. Same class as F1 — internals leaking into the UI.

---

# 4. Contract

## 4.1 Status → message

Every message is plain language. **No status code and no response body is ever shown to the
admin.** Each states the safety invariant.

| Condition | Cause | Message |
|---|---|---|
| `AbortError` | admin cancelled | "Import cancelled — {done} of {total} chunks already saved. Press Import to resume." *(shipped, slice 3)* |
| `408` / `425` | transient | retried automatically; shown only if retries exhaust |
| `429` + `Retry-After` | rate limited | "Too many requests — waiting {n}s before retrying chunk {c}." |
| `504` | route exceeded `maxDuration` | "The server ran out of time on chunk {c} of {m}. **Nothing was lost** — {saved} rows are already saved. Press Import to resume." |
| other `5xx` | transient | "Chunk {c} of {m} could not be saved. **Nothing was lost** — {saved} rows are already saved. Press Import to resume." |
| `400` | our own rejection | surface `data.error` **verbatim** — e.g. "More than one semester is active. Deactivate all but one before importing." |
| `fetch` rejected, no response | network | "Could not reach the server. Check your connection and try again." *(current fallback, kept)* |
| response not JSON, `2xx` | contract bug | treated as other-`5xx`; never the raw body |

`400` is the one case that must stay verbatim, because the D1 guard's messages
("No active semester…" / "More than one semester is active…", `route.ts:31,37`) are already
written for the admin and no paraphrase improves them.

## 4.2 Retry policy

Keep retrying what a retry can fix; stop retrying what it cannot.

| Condition | Retry |
|---|---|
| `408`, `425`, `429` | yes — with existing backoff, `Retry-After` honoured |
| transient `5xx` | yes — existing backoff |
| **`504`** | **no blind retry at the same size.** See §4.3 |
| `400` | no — a validation failure repeats exactly |
| `AbortError` | no — user asked to stop |

## 4.3 Timeout shrinks the chunk for the rest of the run

A 504 is a statement that the chunk was too large for the ceiling. The self-healing response is to
retry **once** at half the chunk size, and keep the smaller size for the remainder of the run:

```
on 504 for chunk i at size S:
    S ← max(MIN_CHUNK, floor(S / 2))      // 100 → 50
    retry chunk i at S, once
    remaining chunks use S
```

This is why the client timer must move: with `STUDENT_CHUNK_SIZE = 100` a healthy chunk is ~15 s,
so the 70 s timer only fires on genuine trouble, and halving gives the retry a real chance.

`MIN_CHUNK` is a floor (proposal: 25 rows) so a pathological file degrades to many small requests
rather than one row per request.

## 4.4 Timeout alignment

| Knob | Now | Becomes |
|---|---|---|
| `maxDuration` (route) | 60 | **unchanged** |
| `chunkTimeoutMs` (client) | `120000` | **`70000`** — just above the ceiling, so the platform's 504 is authoritative and the client stops narrating on a stale timer |

The client must not fire *before* the route dies, or it would abort requests that would have
succeeded. 70 s leaves 10 s of margin over `maxDuration = 60`.

## 4.5 Correlation key

Every failure message ends with a reference the admin can hand to a developer:

```
Reference: {fileId}
```

`fileId` is already generated per run by `useChunkedImport` and already persisted to the audit
trail on the final chunk, so it resolves to a database row with no new plumbing.

**Do not** use Vercel's `x-vercel-id`. It would be a better key, but whether it is readable
cross-origin depends on `Access-Control-Expose-Headers` on the Vercel side — **UNVERIFIED**, and
unverifiable from this repo. If it later turns out to be exposed, it can be added alongside
`fileId` without changing the message shape.

---

# 5. Scope

| | |
|---|---|
| **In scope** | `features/admin-data/components/useChunkedImport.ts` (message mapping, retry policy, timeout default) · `features/users/components/bulk-import/BulkStudentImport.tsx` `postChunk` · `features/admin-data/components/FacultyLoadingTab.tsx` `postChunk` (error path only) |
| **Out of scope** | The timeout itself — batched resolution is `step-03-enrollments.md`'s slice · `maxDuration` · the ledger · per-department panels · any new route · email |
| **Not a goal** | A global error boundary, a retry button per chunk, or making a 504 impossible |

## Both importers, one fix

`useChunkedImport` is shared (`FacultyLoadingTab.tsx:18`, `BulkStudentImport.tsx:5`), so the message
mapping, retry policy and timeout default belong **in the hook**, not in either caller. Only the
two `postChunk` bodies need touching, and only to stop reading raw bodies.

`FACULTY_CHUNK_SIZE = 100` (`FacultyLoadingTab.tsx:163`) and `STUDENT_CHUNK_SIZE = 100` now match,
and both already cite the same visibility reason — the sh runk-on-timeout policy therefore applies
evenly to a 28k-row faculty file and a 22k-row student file.

---

# 6. Risks

| Risk | Mitigation |
|---|---|
| A real 504 is masked as "retry failed" | The 504 branch names the timeout explicitly and says rows are safe; it never collapses into the generic 5xx text |
| Halving the chunk hides a systemic problem | Log the halving (and the `fileId`) so a run that shrank 100→25 is visible rather than silent |
| `400` messages drift from the route's wording | `400` is surfaced verbatim by rule (§4.1); no paraphrase layer exists to drift |
| A `2xx` with a non-JSON body is treated as a server error | Safer than rendering the body, and it is a contract violation either way — it should look like one |
| Retry-now-returning-429 loses the `Retry-After` value | `withRetryHints` already parses it; the message path only reads it |

---

# 7. Tests required

Extend the hook's test surface. `useChunkedImport` has no test file today — this spec creates one.

| Case | Assert |
|---|---|
| 504 is not blindly retried at the same size | attempts stop at 1 for that chunk; the chunk is retried at `S/2` |
| 429 honours `Retry-After` | delay equals the hint, not the exponential base |
| `400` is never retried | one attempt, message is `data.error` verbatim |
| no message ever contains a status code | snapshot the rendered text for each branch |
| no message ever contains a response body | throw an error whose `message` is HTML; assert it is absent |
| timeout default is 70s | the hook's default constant |
| chunk shrink persists to the end of the run | after one 504, later chunks post at the smaller size |
| safety invariant present in every failure | each failure message matches `/nothing was lost/i` or the cancel wording |

**Proof:** `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
Baseline at time of writing: 267 tests / 19 files.

---

# 8. Slices

| Slice | Contents |
|---|---|
| **U1** | Message mapping in `useChunkedImport`; both `postChunk` bodies stop reading raw bodies (F1, F2, F7) |
| **U2** | Retry policy split + 504 chunk-halving (F3) |
| **U3** | Timeout alignment to 70 s (F4) |
| **U4** | Safety invariant in every message + `fileId` reference (F5, F6) |

U1 is independently shippable and is the one that stops raw internals reaching the screen; the
others refine behaviour. Each slice carries its own gate per §7.
