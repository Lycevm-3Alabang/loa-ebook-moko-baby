# The docs — the handover, the TODO row, the specs index

**Version:** 1.0
**Status:** Draft (2026-10-22)
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part II, v6.0)

The last slice: what the next reader finds, and where the durable knowledge lives.

---

## 1. What changes

| File | Change |
|---|---|
| `docs/evaluation-export-department-handover.md` | ⭐ **rewritten** — the entry point: where the work stands · the shapes · the proofs · what not to redo |
| `TODO.md` | the NEXT row — ⭐ **the owner's file: listed, not edited** |
| `specs/README.md` | the status row + the specs index (the new folder) |
| `specs/evaluation-results-export.md` | ⭐ **already done** (v6.0) — it is amended again if the spike's numbers change the guard |

## 2. The rules

1. ⭐ **One handover at a time.** The file is **replaced**, not appended to — the previous
   handover's durable content is already in the specs, and a handover that grows becomes a
   second, stale copy of the contract.
2. ⭐ **The handover names the specs; it does not repeat them.** The reader is pointed at
   `specs/evaluation-results-export.md` (v6.0) and the sub-spec folder — the shape, the
   decisions and the proofs are **there**.
3. ⭐ **The durable decisions live in the specs.** If a decision outlives this session, it
   belongs in a spec (the contract) or a sub-spec (its slice) — never only in the handover.
4. ⭐ **`TODO.md` is the owner's file.** The NEXT row is **reported**, and the owner edits it —
   the agent does not.
5. ⭐ **The specs index names the folder**, so the sub-specs are findable from the entry
   point (`specs/README.md`).

## 3. What the handover says (the shape)

- **Where the export stands** — the ZIP's route, the surface, the proofs, and what is still
  open (the faculty-card decision, if it was not taken).
- ⭐ **What changed for the school** — the download is a **ZIP**: the files it already receives,
  one per subject-section, plus a consolidated file per faculty.
- **The traps for the next reader** — ⭐ the ones that cost time here: the **47 KB letterhead
  in every workbook**, the **store-only zip** (and why the outer one is DEFLATE), the
  **response-size limit**, the **N + 1 reads**, and the **live-eval / NULL-period** cases
  where the subject read and the department read can differ.
- **What not to redo** — the stacked workbook (dropped), the DEFLATE lever, the shared
  builder's extraction.

## 4. Out of scope

- **Any code** — this slice is documents only.
- **Editing `TODO.md`** — ⭐ reported, not edited.
- **The other open items in `TODO.md`** (the legend, the HTML preview, the PDF's four defects,
  the sentiment deferral) — they stay where they are.
