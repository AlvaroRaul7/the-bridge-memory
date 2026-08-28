# Project Lighthouse — Updated IP Position

*Data-room tranche 3, 2026-06-12. Includes the first response from independent IP counsel (Nakashima IP).*

## Chain of title — the tranche-1 representation does not hold

Farrow & Lin represented in tranche 1 that IP assignment coverage was **100%**. Independent
review finds:

- **US-11,204,881 (streaming schema inference)** — the named inventor of the two core claims
  is **J. Beeching**, a contractor engaged 2018–2019 whose **assignment agreement is not on
  file**. This is the subject of *Helios v. Beeching*. Until resolved, the target's ownership
  of its most important patent is **contested, not owned outright**.
- **EP-3,918,442** — same family, same defect.
- 11 of 34 former technical contractors (2017–2019 cohort) have **no assignment agreement on
  file**.

## US-11,644,190 (adaptive materialisation) — licensed, not owned

Tranche 1 listed this as "owned outright." Tranche 3 produces a **2022 assignment-back and
licence** from Ridgeline Systems: Helios sold the patent to Ridgeline in 2022 in a cash-raise
and took back a **non-exclusive, non-sublicensable, field-limited licence**.

Consequences:
- Helios cannot enjoin a competitor under this patent.
- The licence is **non-sublicensable**, which is a direct problem for our post-close plan to
  fold the engine into our own platform and resell it.
- Change-of-control: the licence terminates on a change of control unless Ridgeline consents.
  **Ridgeline consent has not been sought.**

## Open source posture — revised

The tranche-1 SBOM covered direct dependencies only. Independent scan of the full tree finds
**one AGPL-3.0 component** (`streamcodec-ng`, vendored 2021) linked into the distributed
ingestion binary. Remediation is a rewrite of the codec layer, estimated 4–7 engineer-months.

## Revised IP risk rating

**HIGH.** Of the two patents that constitute the core differentiator, one has contested
title and the other is licensed with a change-of-control termination right held by a third
party whose consent has not been requested.
