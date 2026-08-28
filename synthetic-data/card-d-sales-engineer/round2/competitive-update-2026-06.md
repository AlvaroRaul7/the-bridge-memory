# Competitive Update — Northwind Risk v9

*From Product Management, 2026-06-05. Distributed to all SEs with active Northwind competition.*

## What Northwind shipped in v9 (GA 2026-05-20)

1. **Latency:** published p99 improved from 180ms to **54ms** on their reference workload.
   Independent benchmarks put them at 51–58ms. **Our 47ms lead is now a rounding error to
   most buyers.**
2. **"Northwind Sovereign"** — a customer-hosted deployment tier. This is new. It removes
   the "SaaS-only" wedge we have used in every regulated-vertical deal.
3. Pricing unchanged — still roughly 40% below our list.

## Where Northwind Sovereign is actually weak

This is the part that matters, and it is not on their website:

- Sovereign requires **their** managed Kubernetes operator and does **not** support OpenShift.
  Vertex runs OpenShift 4.14. This is a hard incompatibility, not a preference.
- Sovereign's audit export is **90 days maximum**; long-retention export is on their roadmap
  for 2027. Vertex needs 7 years for BaFin.
- Sovereign has **no Kafka-native ingestion** — it requires their own agent, which means
  Vertex re-plumbs the streaming layer they explicitly refuse to touch.
- Sovereign has three reference customers, all under 400 employees, none regulated.

## Recommended repositioning

**Stop leading with latency.** It is now parity and leading with it invites a price
comparison we lose.

**Lead with regulated-deployment depth:** OpenShift-native, offline licence mode (v4.2+),
Kafka-native ingestion, 7-year audit retention. Each of those maps to a stated Vertex
requirement that Sovereign cannot meet.

Our differentiator moved from **"we are faster"** to **"we are the only one that actually
runs where you run."**
