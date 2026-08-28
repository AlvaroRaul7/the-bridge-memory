# Vertex Financial — Call 4 Debrief & New Objection

*Call held 2026-06-03. Attendees: Klaus Berger, Stefan Vogt, Ines Dubois, Amara Nwosu (last 15 min).*

## O6 — "Your control plane phones home. That is a BaFin problem." — NEW, BLOCKING

**Raised by:** Ines Dubois, escalated by Stefan.

Ines' InfoSec team reviewed our deployment topology doc (the one we sent to close O2) and
found that our self-managed deployment still opens an **outbound telemetry and licence-check
connection** to our control plane every 60 seconds.

Her position, verbatim:

> "You told us the deployment is air-gappable. It is not. It is self-hosted with a callback.
> Under our BaFin operational-resilience assessment, an outbound dependency on a vendor
> endpoint in the trade-data path is a critical third-party dependency and requires a full
> ORA filing. That is a nine-month process. It is not a nine-month process we are going to
> start for a vendor we have not selected."

**Severity: blocking.** This reopens O2, which we had marked addressed. Worse, it reads as
if we oversold the deployment story in call 1 — Stefan said so out loud.

**What we actually have:** a fully offline licence mode shipped in v4.2 (March 2026) with
manual licence-file rotation and telemetry disabled. It is not in the topology doc, which
predates it. **This is a documentation failure, not a product gap.**

## O1 update — latency is no longer the wedge

Stefan ran his own bench against **Northwind's new v9 release** and reported **51ms p99** on
a workload approximating theirs. Our published figure is 47ms. He said:

> "You are four milliseconds better than the cheap option. That is not a reason."

## Other signals

- Amara Nwosu asked, for the first time, about **implementation risk and who owns the
  migration** — a buying-mode question, not an evaluation question.
- Marc Lefevre confirmed the RFP scoring weights: Security & Compliance 35%, Technical Fit
  30%, Commercials 25%, Vendor Viability 10%. **Security outweighs technical fit.**
- Klaus is still our champion but was quiet after Ines spoke.
