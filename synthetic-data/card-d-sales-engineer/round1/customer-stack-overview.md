# Vertex Financial — Customer Stack Overview

*Prepared by the SE team after discovery calls 1 and 2. Last updated 2026-02-18.*
*Opportunity: Vertex Financial — Product X (real-time risk aggregation platform). $1.4M ACV, 5-year potential.*

## Who they are

Vertex Financial — mid-market capital markets firm, ~2,400 employees, HQ Frankfurt, trading
desks in Frankfurt, London, Singapore. Regulated under BaFin; MiFID II reporting obligations.

## Current architecture

| Layer | What they run | Notes |
| --- | --- | --- |
| Streaming | Confluent Kafka (self-managed, 3 clusters) | 2.1M events/sec peak. Their pride and joy. |
| Compute | Kubernetes on-prem (OpenShift 4.14) | Explicit "no public cloud for trade data" policy. |
| Risk engine | In-house C++ monolith, "Atlas" | 11 years old. 40+ engineers maintain it. |
| Data warehouse | Snowflake (EU-Frankfurt) | Only non-trade data. |
| Identity | Okta + on-prem AD | SAML required, SCIM strongly preferred. |
| Observability | Datadog | Contract renews 2026-11. |

## The buying committee

| Name | Role | Stance | What they care about |
| --- | --- | --- | --- |
| **Klaus Berger** | Head of Risk Technology | Champion | Wants Atlas decomposed. Owns the budget line. |
| **Amara Nwosu** | Chief Risk Officer | Economic buyer | Cares about regulator defensibility, not architecture. |
| **Stefan Vogt** | Principal Architect | Skeptic | Built half of Atlas. Reads our docs adversarially. The real gatekeeper. |
| **Ines Dubois** | Head of InfoSec | Gatekeeper | Deployment model and data residency. Nothing else. |
| **Marc Lefevre** | Procurement | Neutral | Runs a scored RFP. |

## Technical requirements they have stated

1. Sub-50ms p99 for intraday risk aggregation across 14 asset classes.
2. Deployment must run **inside their own VPC/on-prem** — no multi-tenant SaaS for trade data.
3. Full audit trail, 7-year retention, exportable for BaFin inspection.
4. Kafka-native ingestion (they will not re-plumb their streaming layer).
5. SAML SSO + SCIM provisioning.

## Competitive situation

- Incumbent: their own Atlas monolith. "Do nothing" is the real competitor.
- **Northwind Risk** is the named external competitor. Cheaper, SaaS-only, strong UI.
- A systems integrator (Kelso & Co) is pitching a build-it-yourself alternative.
