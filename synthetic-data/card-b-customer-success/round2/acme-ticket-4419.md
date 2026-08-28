# Acme Corp — New Support Ticket ACME-4419

**Opened:** 2026-05-18
**Severity:** P1
**Reported by:** Devon Ellis (CTO)
**Subject:** Analytics module returning stale data for EU-West tenants

## Description (customer's words)

> "Our Q2 board reporting is being generated off your Analytics module and the numbers are
> 48 hours stale for our EU-West tenants. We only caught it because a plant manager
> questioned a figure. This is the third data-integrity issue since October and the second
> one my team found before yours did. I need a root cause and a written remediation plan,
> not a credit."

## Current status

- Root cause identified 2026-05-20: the EU-West materialised view refresh job silently
  failed after a schema migration on our side. No alerting covered it.
- Fix deployed 2026-05-21. Backfill completed 2026-05-22.
- **Written RCA still outstanding as of 2026-05-28** — 7 days past our commitment.
- Under the April amendment this breached the new 2-business-hour P2 response window on
  first response (actual: 5h 20m), and service credits now cap at 50%.

## Related

- **ACME-4288 (analytics export timeout) is still open** — now 28 weeks old, still no ETA.
  Devon referenced it explicitly in this ticket's thread.
- Devon has asked for the RCA to be presented to Acme's new Vendor Review Board in September.

## CSM note

Devon's phrase "not a credit" is the important part. Money is not what he wants. He wants
evidence that our engineering process changed. Any renewal or expansion conversation that
opens on commercials before addressing this will go badly.
