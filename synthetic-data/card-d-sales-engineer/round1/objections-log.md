# Vertex Financial — Objections Log

*Raised across discovery calls 1–3. Owner: SE team. Last updated 2026-02-18.*

## O1 — "Your latency numbers are benchmarks, not our workload"
**Raised by:** Stefan Vogt, call 2.
**Our answer:** Offered a POC on their own data. Shared the methodology doc for our
p99 numbers (14 asset classes, 2M events/sec, 47ms p99 on reference hardware).
**Status:** Partially addressed. Stefan wants the POC before he believes it.

## O2 — "We can't put trade data in your cloud"
**Raised by:** Ines Dubois, call 1. Reinforced by Stefan, call 2.
**Our answer:** Self-managed deployment into their OpenShift. Control plane can be
air-gapped from ours.
**Status:** Addressed, pending InfoSec review of the deployment topology doc.

## O3 — "Northwind is 40% cheaper"
**Raised by:** Marc Lefevre, call 3.
**Our answer:** TCO framing — Northwind is SaaS-only, so Vertex would need a separate
solution for trade data anyway. Two tools, not one.
**Status:** Weakly addressed. Marc scores on line-item price, not TCO narrative.

## O4 — "Why not just refactor Atlas ourselves?"
**Raised by:** Stefan Vogt, call 3.
**Our answer:** Time-to-value. 40 engineers × 18 months of opportunity cost. Klaus
supported us on this one publicly.
**Status:** Addressed. Klaus is our proxy on this objection.

## O5 — "Seven-year audit retention will cost us a fortune in storage"
**Raised by:** Amara Nwosu, call 3.
**Our answer:** Tiered retention with cold-storage export to their existing object store.
**Status:** Addressed.

## Reading the room

Stefan Vogt is the objection engine. Klaus is our champion but does not outrank Stefan
technically. Amara signs but will not overrule an InfoSec or architecture objection.
**The path to yes runs through Stefan, not around him.**
