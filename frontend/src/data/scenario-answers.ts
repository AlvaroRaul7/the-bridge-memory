/**
 * Per-scenario reference answers and seed memories.
 *
 * Two jobs, both stand-ins for services that do not exist yet:
 *
 *  1. The stubbed agent reply in the Console chat. Spec 3 permits a stub;
 *     Spec 2 has no chat endpoint because per Spec 4 the agent calls the
 *     backend as tools rather than the UI proxying a conversation.
 *  2. Seed data for the msw mock of Spec 2 (see mocks/seed.ts) so the memory
 *     inspector and search have real domain content to return.
 *
 * Key `<scenario-id>:1` is the answer before the round-2 documents land,
 * `:2` is the answer after — the "same question, sharper answer" comparison,
 * reproduced in the UI via the session switcher.
 *
 * These are hand-written, NOT model output. When Spec 1, 2 and 4 are running,
 * this file is dead weight — delete it.
 */

import type { MemoryEntry, SessionEvent } from '@/lib/types'

export interface ScenarioAnswer {
  title: string
  answer: string
  events: SessionEvent[]
  memoryAfter: MemoryEntry[]
}

type ToolBeat = [name: string, target: string, isMemory: boolean]

function build(
  title: string,
  toolsBefore: ToolBeat[],
  answer: string,
  toolsAfter: ToolBeat[],
  memoryAfter: MemoryEntry[],
): ScenarioAnswer {
  const events: SessionEvent[] = [
    ...toolsBefore.map(([name, target, isMemory]) => ({
      kind: 'tool_use' as const,
      name,
      target,
      isMemory,
    })),
    // Stream the answer a paragraph at a time so the pane fills visibly.
    ...answer
      .split('\n\n')
      .map((chunk, i, all) => ({
        kind: 'text' as const,
        text: chunk + (i < all.length - 1 ? '\n\n' : ''),
      })),
    ...toolsAfter.map(([name, target, isMemory]) => ({
      kind: 'tool_use' as const,
      name,
      target,
      isMemory,
    })),
  ]
  return { title, answer, events, memoryAfter }
}

const mem = (path: string, content: string): MemoryEntry => ({
  path,
  content,
  chars: content.length,
})

export const scenarioAnswers: Record<string, ScenarioAnswer> = {
  /* ===================== CARD A — ONBOARDING ============================= */

  'card-a-onboarding:1': build(
    'Card A — Session 1 — baseline',
    [
      ['bash', 'ls -la /mnt/memory/', true],
      ['read_file', '/mnt/memory/ (empty)', true],
      ['read_file', 'onboarding-handbook.md', false],
      ['read_file', 'access-policy.md', false],
      ['read_file', 'team-directory.md', false],
    ],
    `My memory store is empty, so this is the first thing I've learned about this domain. Answering from the documents you gave me.

**You need read-only prod access. Here is the process.**

**Eligibility first.** Read-only access requires 2 weeks of tenure plus a completed pairing session with an SRE. If you joined less than two weeks ago you are not eligible yet under the standard path — see the exception below.

**The standard request:**

1. Open a ticket in the \`#sre-access-requests\` Slack channel.
2. Tag your direct manager **and** the SRE on rota for that week. The rota changes weekly — check the on-call schedule in PagerDuty.
3. The SRE on rota schedules a 30-minute pairing session within 2 working days.
4. After the pairing session, the SRE files your access via Okta. Provisioning completes within about 4 hours.

**Because you need it tomorrow:** the 2-working-day scheduling window plus 4 hours of provisioning means the standard path will not land in time. There is an exception clause — if this is a P1 incident, the on-call SRE may grant temporary 24-hour access without a pairing session. You then have 5 working days to complete the pairing or the access is revoked automatically.

**People to talk to:**
- The SRE on rota this week (check PagerDuty) — they own the pairing session and file the access.
- **Carlos Mendes** (@carlosm), Head of SRE — owns the rotation, and the person to escalate to if the rota SRE is unresponsive.
- Your direct manager, for the sign-off tag on the ticket.

The policy is owned by **Maya Singh** (@maya-s), Head of Security, effective January 2026.`,
    [
      ['write_file', '/mnt/memory/policies/prod-access.md', true],
      ['write_file', '/mnt/memory/people/org-chart.md', true],
      ['write_file', '/mnt/memory/faq/read-only-prod-access.md', true],
    ],
    [
      mem(
        '/mnt/memory/faq/read-only-prod-access.md',
        `# FAQ: "How do I get read-only prod access?"

Asked 2026-01 (session 1). Most common new-hire question.

Answer: Slack ticket in #sre-access-requests, tag manager + rota SRE,
30-min pairing session, SRE files via Okta, ~4h provisioning.
Urgent path: on-call SRE can grant 24h temporary access for a P1.

Source: onboarding-handbook.md v4.2, access-policy.md (Jan 2026).`,
      ),
      mem(
        '/mnt/memory/people/org-chart.md',
        `# Key people — as of January 2026

| Role | Name | Slack |
| --- | --- | --- |
| Head of Engineering | Anika Reddy | @anika |
| Head of SRE | Carlos Mendes | @carlosm |
| Head of Platform | Yuki Tanaka | @yuki |
| Head of Security | Maya Singh | @maya-s |
| Engineering Ops Lead | Tom Bryce | @tomb |

Service ownership: payment-service → Tom Bryce; auth/signing/tenant-config
→ Yuki Tanaka; frontend → Priya Shah.

Source: team-directory.md (January 2026).`,
      ),
      mem(
        '/mnt/memory/policies/prod-access.md',
        `# Production access policy

Effective: January 2026. Owner: Maya Singh (Head of Security).

Three levels:
- Read-only — 2 weeks tenure + SRE pairing session
- Read-write — 6 weeks + tech lead + SRE sign-off
- Privileged — on-call certification (~12 weeks)

Read-only request path: Slack ticket (#sre-access-requests) → tag manager +
rota SRE → pairing session within 2 working days → SRE files via Okta → ~4h.

Urgent exception: on-call SRE may grant 24h temporary access for a P1;
pairing must follow within 5 working days or access is revoked.

Source: access-policy.md, reviewed 2025-12-15.`,
      ),
    ],
  ),

  'card-a-onboarding:2': build(
    'Card A — Session 2 — after memory + new context',
    [
      ['bash', 'ls -la /mnt/memory/', true],
      ['read_file', '/mnt/memory/policies/prod-access.md', true],
      ['read_file', '/mnt/memory/people/org-chart.md', true],
      ['read_file', '/mnt/memory/faq/read-only-prod-access.md', true],
      ['read_file', 'policy-update-2026-05-15.md', false],
      ['read_file', 'team-directory-update.md', false],
    ],
    `**What changed since our last session: the entire read-only prod access workflow was replaced.** My memory had the January 2026 policy — Slack ticket plus an SRE pairing session. That policy was superseded on **2026-05-15**. If I gave you my previous answer you would be following a process that no longer exists.

**The current process (effective 2026-05-15):**

1. Complete the **Prod Access Foundations** course in the BTS Learning portal. 90 minutes, self-paced, and you can start it right now.
2. Pass the assessment. The completion email contains the link to the IAM platform.
3. Request access **through the IAM platform** — not Slack. Access is granted **just-in-time**, scoped to a **4-hour window** per request. Re-request as often as you need.
4. Your manager is notified of each request but does **not** need to sign off on individual requests. Manager sign-off applies only to the initial certification.

**No SRE pairing session. No Slack ticket. No 2-working-day scheduling wait.**

**Good news on your timeline.** The tenure requirement dropped from **2 weeks to 3 working days** — you can certify and request access from day 4. And because the new flow is self-service, "I need it tomorrow" is now a 90-minute problem rather than a multi-day one. You do not need the urgent-exception path that the old policy required.

**Who to talk to — also changed since my last session:**
- For the certification itself: nobody. It is self-service in the Learning portal.
- If IAM provisioning fails: **Carlos Mendes** (@carlosm) is still Head of SRE, unchanged.
- Policy owner: **Maya Singh** (@maya-s), Head of Security, now co-owned with Carlos Mendes.
- Note that **Yuki Tanaka is Head of Engineering** as of 2026-04-15. My previous answer would have pointed you at Anika Reddy, who moved to Chief AI Officer on 2026-04-01. Tom Bryce is now Head of Platform, and **Priya Shah** is the Engineering Ops Lead.

**One thing to watch:** anyone who already held read-only access under the old policy keeps it only through **2026-06-30**, after which they must complete the new certification or lose it. That deadline has passed, so if a colleague tells you "I never had to do a course," their access has already lapsed.

I have updated my memory: the prod-access policy entry now records the new flow with its 2026-05-15 effective date and a note of what it replaced, and the org chart entry has been rewritten rather than appended to.`,
    [
      ['edit_file', '/mnt/memory/policies/prod-access.md', true],
      ['edit_file', '/mnt/memory/people/org-chart.md', true],
      ['edit_file', '/mnt/memory/faq/read-only-prod-access.md', true],
      ['write_file', '/mnt/memory/policies/_changelog.md', true],
    ],
    [
      mem(
        '/mnt/memory/faq/read-only-prod-access.md',
        `# FAQ: "How do I get read-only prod access?"

CURRENT ANSWER (as of 2026-05-15):
1. Complete "Prod Access Foundations" in the BTS Learning portal (90 min).
2. Request access via the IAM platform (link in the completion email).
3. Access granted just-in-time, 4-hour window per request. Re-request freely.
4. Manager notified, no per-request sign-off.

Eligible from day 4 (3 working days tenure).

SUPERSEDED 2026-05-15: the Slack-ticket + SRE-pairing-session answer.
Do not give the old answer — the #sre-access-requests path is retired.

Source: policy-update-2026-05-15.md.`,
      ),
      mem(
        '/mnt/memory/people/org-chart.md',
        `# Key people — as of May 2026 (post re-org)

| Role | Name | Slack |
| --- | --- | --- |
| Chief AI Officer | Anika Reddy | @anika |
| Head of Engineering | Yuki Tanaka | @yuki |
| Head of SRE | Carlos Mendes | @carlosm |
| Head of Platform | Tom Bryce | @tomb |
| Head of Security | Maya Singh | @maya-s |
| Engineering Ops Lead | Priya Shah | — |

Changed 2026-04/05: Anika Reddy → Chief AI Officer (was Head of Engineering,
eff. 2026-04-01). Yuki Tanaka → Head of Engineering (eff. 2026-04-15).
Tom Bryce → Head of Platform (was Eng Ops Lead). Priya Shah → Eng Ops Lead
(was Web lead).

Service ownership: payment-service → Maya Patel (was Tom Bryce);
frontend → Daniel Okonkwo (was Priya Shah); auth/signing/tenant-config
unchanged under Platform.

Source: team-directory-update.md (May 2026). Supersedes January 2026 entry.`,
      ),
      mem(
        '/mnt/memory/policies/_changelog.md',
        `# Policy changelog

## 2026-05-15 — Production access policy replaced
- Trigger: incident review PROD-INC-04-2026; pairing-session backlog hit 3 weeks.
- Read-only: SRE pairing session → online certification + JIT 4-hour access.
- Request channel: Slack (#sre-access-requests) → IAM platform.
- Tenure: 2 weeks → 3 working days.
- Grandfathering for existing holders ended 2026-06-30.
- Unchanged: read-write and privileged requirements; on-call escalation path.

## 2026-01 — Original three-level policy recorded (session 1).`,
      ),
      mem(
        '/mnt/memory/policies/prod-access.md',
        `# Production access policy

Effective: 2026-05-15. Supersedes January 2026 version.
Owners: Maya Singh (Security) + Carlos Mendes (SRE).

Read-only (CURRENT):
- Eligibility: 3 working days tenure. Access from day 4.
- Complete "Prod Access Foundations" course (90 min, BTS Learning portal).
- Request via IAM platform. Just-in-time, 4-hour window per request.
- Manager notified per request; sign-off only on initial certification.
- NO SRE pairing session. NO Slack ticket.

Read-write and privileged: unchanged from January 2026.

WAS (January 2026, no longer valid): 2 weeks tenure, Slack ticket in
#sre-access-requests, tag manager + rota SRE, 30-min pairing session,
Okta provisioning ~4h, 24h urgent exception for P1s.

Grandfathering: old-policy holders retained access to 2026-06-30 only.

Source: policy-update-2026-05-15.md.`,
      ),
    ],
  ),

  /* ===================== CARD B — CUSTOMER SUCCESS ======================= */

  'card-b-customer-success:1': build(
    'Card B — Session 1 — baseline',
    [
      ['bash', 'ls -la /mnt/memory/', true],
      ['read_file', 'acme-account-history.md', false],
      ['read_file', 'acme-contract-summary.md', false],
      ['read_file', 'acme-support-tickets.md', false],
    ],
    `Memory store is empty — first session on this account. Here is what I have from the documents.

**Going into a renewal conversation with Sarah Chen:**

**Who she is.** Sarah Chen is Acme's CTO, promoted August 2025. She became our executive sponsor in November 2024 after our original champion, VP Eng Marcus Webb, left. She personally signed the 2025 renewal. She prefers direct email and dislikes decks — send her prose, not slides.

**Contract position.** ACME-2025-003, effective 2025-03-15, running to 2028-03-14. $840,000 ARR, 500 seats on the Platform tier plus the Analytics module. 18% off list, contingent on the 3-year commitment, with annual uplift capped at 4%. Acme has no termination-for-convenience right — termination for cause only.

**So the first thing to know is that this renewal is not due.** We are two years out. If Sarah is asking for a renewal proposal now, she is opening a strategic renegotiation, and we should understand what she wants before we quote anything.

**What she is likely to push on:**

1. **Seat under-utilisation.** 305 of 500 seats active in the last 30 days — 61%. This is the biggest single risk. Marta Ruiz in Procurement will use it to argue for a seat reduction, which the current contract does not permit mid-term.
2. **Support satisfaction.** CSAT is 3.1/5 against a 4.2 company average. Devon Ellis, Director of Platform Engineering, has raised time-to-first-response in two consecutive QBRs.
3. **The October 2025 outage.** 18 hours partial, $21k in service credits already issued.
4. **ACME-4288** — the analytics export timeout. Open 10 weeks, no ETA. Hiro Nakamura has escalated it twice for us internally and is burning his own credibility doing it.

**Competitive context.** Northwind has been talking to Acme procurement since mid-2025.

**My recommendation:** do not lead with commercials. Lead with a written plan for ACME-4288 and a support-responsiveness commitment. Bring Hiro Nakamura in early — he is our strongest advocate and he runs their internal user community.`,
    [
      ['write_file', '/mnt/memory/accounts/acme/contacts.md', true],
      ['write_file', '/mnt/memory/accounts/acme/contract.md', true],
      ['write_file', '/mnt/memory/accounts/acme/risks.md', true],
    ],
    [
      mem(
        '/mnt/memory/accounts/acme/contacts.md',
        `# Acme Corp — contacts (as of 2026-01)

- Sarah Chen — CTO (since 2025-08). CHAMPION + exec sponsor. Signed the 2025
  renewal. Prefers direct email, dislikes decks.
- Devon Ellis — Director of Platform Engineering. Neutral/negative. Day-to-day
  technical owner. Frustrated by the Oct 2025 outage and response times.
- Marta Ruiz — Procurement. BLOCKER. Ran a 2025 competitive bake-off.
- Hiro Nakamura — Staff Engineer. STRONGEST ADVOCATE. Runs their internal user
  community. Has escalated ACME-4288 twice on our behalf.

Source: acme-account-history.md.`,
      ),
      mem(
        '/mnt/memory/accounts/acme/contract.md',
        `# Acme Corp — contract ACME-2025-003

Effective 2025-03-15 → 2028-03-14 (3-year term).
ARR $840,000. 500 seats, Platform tier + Analytics module.
18% off list, contingent on the 3-year commitment.
Uplift cap 4% annually. Seats may be added mid-term at $1,680/seat/yr;
seats CANNOT be reduced mid-term.
No termination for convenience (cause only, 30-day cure).
SLA 99.9%; P2 response 4 business hours; credits capped at 30% of monthly fee.
EU-only data residency (clause 11.2). Benchmarking right once per 12 months.

Renewal not due until 2028. Any earlier conversation is strategic, not required.

Source: acme-contract-summary.md.`,
      ),
      mem(
        '/mnt/memory/accounts/acme/risks.md',
        `# Acme Corp — open risks (2026-01)

1. Seat utilisation 61% (305/500). Biggest renewal risk; procurement lever.
2. CSAT 3.1/5 vs 4.2 company average. Complaint is response TIME, not quality.
3. ACME-4288 (analytics export timeout >2M rows) — open 10 weeks, no ETA.
   Hiro has escalated twice internally.
4. Northwind in conversations with Acme procurement since mid-2025.
5. Oct 2025: 18h partial outage, $21k credits issued.

Health score 72/100, trending down since Q4 2025.`,
      ),
    ],
  ),

  'card-b-customer-success:2': build(
    'Card B — Session 2 — after memory + new context',
    [
      ['bash', 'ls -la /mnt/memory/accounts/acme/', true],
      ['read_file', '/mnt/memory/accounts/acme/contacts.md', true],
      ['read_file', '/mnt/memory/accounts/acme/contract.md', true],
      ['read_file', '/mnt/memory/accounts/acme/risks.md', true],
      ['read_file', 'acme-leadership-change-2026-05.md', false],
      ['read_file', 'acme-contract-amendment-2026-04.md', false],
      ['read_file', 'acme-ticket-4419.md', false],
    ],
    `**Stop — the premise of the question is out of date, and it matters.**

**Sarah Chen is not Acme's CTO any more.** She moved to a newly created Chief Strategy Officer role effective 2026-04-30. She no longer owns the technology budget and is not a decision-maker on vendor renewals. In my last session I had her as our champion and economic buyer; that is no longer true.

**Devon Ellis is the CTO**, effective 2026-05-01. Devon is the person who has spent two consecutive QBRs complaining about our support response times, and he opened a P1 against us two weeks ago. Our champion left the seat and our loudest critic took it.

So: if the email really is from Sarah, treat it as a warm signal, not a buying signal. She may be doing Devon a favour, or she may be operating on old habits. **Confirm who owns this renewal before you send anything.** If Devon is not on the thread, that is itself information.

**The contract is not what my notes said either.** Amendment No. 1 was executed 2026-04-08 after Acme exercised its benchmarking right:

| | Was | Now |
| --- | --- | --- |
| ARR | $840,000 | **$688,000** |
| Seats | 500 | **400** |
| Term end | 2028-03-14 | **2029-03-14** |
| Uplift cap | 4% | **2.5%** |
| Termination for convenience | none | **available from 2027-04-01, 120 days notice** |
| P2 response | 4 business hours | **2 business hours** |
| Credit cap | 30% of monthly fee | **50%** |

Two consequences. First, any proposal built on the $840k / 500-seat / 4%-uplift picture is simply wrong — and Devon will notice, which would be an expensive way to open. Second, **we no longer have the term as leverage**: Acme can walk from 2027-04-01 with 120 days notice. The renewal conversation is effectively live now, whether or not the paper says 2029.

**The thing to address before commercials: ticket ACME-4419.** Opened 2026-05-18 by Devon himself, P1, Analytics returning 48-hour-stale data for EU-West tenants. His team found it, not ours — the second time. Root cause was an unalerted materialised-view refresh failure after our schema migration. Fixed 2026-05-21, backfilled 2026-05-22, and **the written RCA is seven days overdue as of 2026-05-28.** First response took 5h 20m against the new 2-business-hour commitment, so we are already in breach with credits now capping at 50%.

His words were "I need a root cause and a written remediation plan, not a credit." Take that literally. Money is not what he wants.

And **ACME-4288 is still open** — 28 weeks now, still no ETA, and Devon cited it in the 4419 thread.

**Two more things that changed since my last session:**
- **Hiro Nakamura left Acme in March 2026** for a competitor. My previous advice was to bring him in early. That advice is dead — we have no bottom-up advocate and no replacement.
- **Marta Ruiz now reports into Devon**, not Finance. Pricing pressure and technical dissatisfaction are consolidated under one leader. Acme has also stood up a quarterly Vendor Review Board; our slot is 2026-09.

**Recommended sequence:**
1. Reply to Sarah warmly, and ask her to loop Devon in. Do not attach a proposal.
2. Deliver the ACME-4419 RCA this week — overdue, and it is the price of entry.
3. Give Devon a dated remediation plan for ACME-4288 with an actual ETA.
4. Only then open commercials, off the amended $688k baseline, and treat 2027-04-01 as the real renewal date.
5. Plan the September Vendor Review Board appearance now.

I have updated memory: contacts and contract entries are rewritten with the new figures and roles, with a note of the previous values and the dates they changed.`,
    [
      ['edit_file', '/mnt/memory/accounts/acme/contacts.md', true],
      ['edit_file', '/mnt/memory/accounts/acme/contract.md', true],
      ['edit_file', '/mnt/memory/accounts/acme/risks.md', true],
      ['write_file', '/mnt/memory/accounts/acme/_changelog.md', true],
    ],
    [
      mem(
        '/mnt/memory/accounts/acme/_changelog.md',
        `# Acme — what changed and when

2026-03  Hiro Nakamura (advocate) left Acme for a competitor. No replacement.
2026-04-08  Amendment No. 1 executed. ARR 840k → 688k, 500 → 400 seats,
            term +12mo, uplift 4% → 2.5%, TFC right added from 2027-04-01,
            P2 SLA 4h → 2h, credit cap 30% → 50%.
2026-04-30  Sarah Chen left CTO role → Chief Strategy Officer. No budget authority.
2026-05-01  Devon Ellis promoted to CTO. Previously our most vocal critic.
2026-05-18  ACME-4419 opened (P1, stale Analytics data, EU-West).
2026-05-xx  Marta Ruiz (Procurement) re-reported into Devon's org.
            Vendor Review Board established, quarterly. Our slot: 2026-09.`,
      ),
      mem(
        '/mnt/memory/accounts/acme/contacts.md',
        `# Acme Corp — contacts (as of 2026-05)

- Devon Ellis — CTO (eff. 2026-05-01). PRIMARY CONTACT + economic buyer.
  Was Director of Platform Engineering. Our most vocal critic on support
  response time. Opened ACME-4419 himself.
- Sarah Chen — Chief Strategy Officer (moved 2026-04-30). NO budget authority.
  WAS CTO and our champion — do not treat her as the buyer any more.
  Still warm; useful as an internal reference only.
- Marta Ruiz — Procurement, now reporting into Devon's org (was Finance).
  Blocker, now with more leverage.
- Hiro Nakamura — DEPARTED 2026-03 to a competitor. Advocate seat is VACANT.

Vendor Review Board (new, quarterly). Our slot: 2026-09.

Source: acme-leadership-change-2026-05.md. Supersedes the 2026-01 entry.`,
      ),
      mem(
        '/mnt/memory/accounts/acme/contract.md',
        `# Acme Corp — contract ACME-2025-003 + Amendment No. 1

CURRENT (Amendment No. 1, executed 2026-04-08):
ARR $688,000. 400 seats. Term to 2029-03-14.
Uplift cap 2.5% annually.
TERMINATION FOR CONVENIENCE available from 2027-04-01, 120 days notice.
P2 response 2 business hours. Service credits cap 50% of monthly fee.
Unchanged: EU-only residency (11.2), $1,680/seat true-up, auto-renewal.

WAS (2025-03-15 original): $840,000 ARR, 500 seats, 4% uplift cap,
no termination for convenience, P2 4h, credit cap 30%.

Read: we traded $152k ARR + a walk-away right for 12 months of term.
The seat under-utilisation argument is gone; so is our term leverage.
Treat 2027-04-01 as the real renewal date, not 2029.

Source: acme-contract-amendment-2026-04.md.`,
      ),
      mem(
        '/mnt/memory/accounts/acme/risks.md',
        `# Acme Corp — open risks (2026-05)

1. ACME-4419 (P1, opened 2026-05-18 by Devon Ellis). Stale Analytics data,
   EU-West. Fixed + backfilled, but WRITTEN RCA IS 7 DAYS OVERDUE.
   First response 5h20m vs the new 2h commitment — already in breach.
   Devon: "I need a root cause and a written remediation plan, not a credit."
2. ACME-4288 still open — 28 weeks, no ETA. Cited by Devon in the 4419 thread.
3. Champion loss: Sarah Chen out of the CTO seat; Devon (critic) in it.
4. Advocate loss: Hiro Nakamura gone, not replaced.
5. Termination-for-convenience right live from 2027-04-01.
6. Vendor Review Board appearance due 2026-09 — Devon wants the RCA presented.

RESOLVED since 2026-01: seat under-utilisation (400 seats now contracted).`,
      ),
    ],
  ),

  /* ===================== CARD C — M&A DILIGENCE ========================== */

  'card-c-ma-diligence:1': build(
    'Card C — Session 1 — baseline',
    [
      ['bash', 'ls -la /mnt/memory/', true],
      ['read_file', 'target-financial-summary.md', false],
      ['read_file', 'target-org-chart.md', false],
      ['read_file', 'target-ip-portfolio.md', false],
    ],
    `Memory store is empty — this is my first pass on Project Lighthouse. Assessment is based on data-room tranche 1 only.

**Current risk assessment: MODERATE.**

**Financials look genuinely good.** FY2025 revenue $62.4M on 39% growth, gross margin improving 71% → 76% over three years, and the business crossed into positive EBITDA in FY2024 and reached $7.8M in FY2025. Net revenue retention of 118% says the product expands inside accounts. $26.1M of cash, no debt beyond an undrawn revolver.

**The caveat I want on the record: FY2025 is unaudited.** These are management accounts. Every figure above is a management representation until the audit lands, and the growth-plus-margin-expansion story is exactly the profile where revenue-recognition timing tends to be aggressive. I would not close on these numbers.

**Customer concentration is acceptable.** Largest customer (Meridian Logistics) at 9.2%, top 5 at 26.8%, top 10 at 38.1%. Nothing above 10%, which is inside our comfort threshold.

**Valuation.** At the indicated $520M EV the target is at 8.3x FY2025 revenue and 66.7x EBITDA. Comparables have cleared 6.5x–9.0x revenue, so the ask sits in the upper half of the range but is defensible if the revenue figure survives audit.

**People risk is the sharpest identified issue.** Raj Malhotra, co-founder and CTO, architected the ingestion engine and the bus factor on it is roughly two. Founder vesting is fully complete, so there is no equity lock holding him. A retention package should be a condition of our offer. Separately, the GC seat is vacant and all legal diligence routes through outside counsel, which has added 3–5 days to every tranche-1 response.

**IP: LOW–MODERATE.** Small estate, but the two granted US patents cover the core differentiator and all four assets are represented as owned outright. Management represents 100% IP assignment coverage across current and former technical staff.

**Open items before I would move off MODERATE in either direction:**
1. The FY2025 audit.
2. Independent verification of IP chain of title for the pre-2019 contractor cohort — requested, not yet received.
3. A full-tree open source scan (the SBOM covers direct dependencies only).

**Management represented on 2026-02-06 that there is no pending or threatened litigation.** I am recording that representation with its date so it can be tested against later disclosure.`,
    [
      ['write_file', '/mnt/memory/lighthouse/financials.md', true],
      ['write_file', '/mnt/memory/lighthouse/ip-position.md', true],
      ['write_file', '/mnt/memory/lighthouse/representations.md', true],
      ['write_file', '/mnt/memory/lighthouse/risk-rating.md', true],
    ],
    [
      mem(
        '/mnt/memory/lighthouse/financials.md',
        `# Project Lighthouse — financials (tranche 1, 2026-02-10)

SOURCE: management accounts. FY2025 is UNAUDITED — flag on every use.

FY2023 $31.2M / FY2024 $44.8M (+44%) / FY2025 $62.4M (+39%)
Gross margin 71% → 74% → 76%. EBITDA (4.1M) → 1.2M → 7.8M.
Cash $26.1M, no debt beyond a $3.0M undrawn revolver. Deferred revenue $28.7M.
NRR 118%, gross retention 91%.

Concentration: Meridian Logistics 9.2%, top 5 26.8%, top 10 38.1%.
Nothing >10% — within comfort threshold.

Valuation at $520M EV: 8.3x FY2025 revenue, 66.7x EBITDA.
Comp range 6.5x–9.0x revenue.`,
      ),
      mem(
        '/mnt/memory/lighthouse/ip-position.md',
        `# Project Lighthouse — IP (tranche 1)

Represented as OWNED OUTRIGHT (per Farrow & Lin, target's counsel):
- US-11,204,881 streaming schema inference (granted 2021) — core
- US-11,644,190 adaptive materialisation (granted 2023) — core
- EP-3,918,442 (EP family member of '881)
- US-2024/0118337 federated query planning (pending)

Trademarks: HELIOS word mark US/EU/UK; sun-disc device US only.
OSS: represented no copyleft; SBOM 2026-01-15, 412 direct deps, all permissive.
Chain of title: represented 100% assignment coverage.

Rating: LOW–MODERATE.
OPEN: independent verification of pre-2019 contractor assignments (requested).
NOTE: SBOM covers DIRECT dependencies only — full-tree scan not yet done.`,
      ),
      mem(
        '/mnt/memory/lighthouse/representations.md',
        `# Management representations — log with dates

2026-02-06 — "No pending or threatened litigation." (management session)
2026-02-10 — Contingent liabilities: none material. (tranche 1 financials)
2026-02-10 — IP assignment coverage 100%. (Farrow & Lin, tranche 1)
2026-02-10 — All four patent assets owned outright. (tranche 1)
2026-02-10 — No copyleft code in the distributed product. (tranche 1)

Each of these is testable against later disclosure. Recheck every tranche.`,
      ),
      mem(
        '/mnt/memory/lighthouse/risk-rating.md',
        `# Project Lighthouse — risk rating

TRANCHE 1 (2026-02-10): MODERATE.

Rationale: growth real, margins improving, concentration acceptable, balance
sheet clean. Principal open items are the FY2025 audit and IP chain of title.

Key person risk: Raj Malhotra (co-founder CTO), bus factor ~2 on the ingestion
engine, founder vesting complete, no equity lock. Retention package should be
an offer condition.
Governance gap: GC seat vacant; legal responses route via outside counsel.`,
      ),
    ],
  ),

  'card-c-ma-diligence:2': build(
    'Card C — Session 2 — after memory + new context',
    [
      ['bash', 'ls -la /mnt/memory/lighthouse/', true],
      ['read_file', '/mnt/memory/lighthouse/risk-rating.md', true],
      ['read_file', '/mnt/memory/lighthouse/financials.md', true],
      ['read_file', '/mnt/memory/lighthouse/representations.md', true],
      ['read_file', '/mnt/memory/lighthouse/ip-position.md', true],
      ['read_file', 'financial-restatement-2026-06.md', false],
      ['read_file', 'disclosed-liabilities-2026-06.md', false],
      ['read_file', 'ip-claims-update-2026-06.md', false],
    ],
    `**This contradicts what I assessed last session, and not at the margin.** In tranche 1 I rated this MODERATE and said the growth story was real. Tranche 3 breaks the basis for that rating.

**Current risk assessment: HIGH. I recommend we do not proceed on current terms.**

**1. The financials I assessed were wrong, and the correction is not cosmetic.**

| | I said (tranche 1) | Audited (tranche 3) |
| --- | --- | --- |
| Revenue | $62.4M | **$54.9M** (−12%) |
| Growth | 39% | **23%** |
| Gross margin | 76% | **71%** |
| EBITDA | $7.8M | **$0.4M** (−95%) |
| NRR | 118% | **104%** |

Management calls this "a technical accounting adjustment, not a business change." I disagree on one of the three components. The $5.1M upfront recognition of multi-year services revenue is a policy error and I will accept that framing. The $0.7M gross-vs-net reseller item likewise. But **$1.7M of what we were shown as "usage overage" revenue was billed and never collected from two customers in dispute** — and those disputes were live when the figure was presented to us as revenue. That is not an accounting policy question.

Note also that CFO Bill Doherty ran both the original FY2025 close and this restatement.

**2. A management representation we relied on was false when made.**

My memory records the 2026-02-06 representation that there was no pending or threatened litigation. Tranche 3 discloses three matters, all predating it:
- *Corvus Analytics v. Helios*, filed **2025-09-30**, trade-secret misappropriation, $14M plus injunctive relief, trial set 2027-Q1.
- *Helios v. Beeching*, filed **2025-11-12**, declaratory relief on IP ownership.
- Two customer fee disputes from 2025-08 and 2025-10 — the same $1.7M reversed in the restatement.

This is the finding that changes the character of the deal. It is no longer only a question of what the target is worth; it is a question of whether management's disclosure can be relied on at all. Everything still uncorroborated in tranche 1 should now be treated as unverified.

**3. The IP position is materially worse than represented.**

- **US-11,204,881** — the named inventor on the two core claims is J. Beeching, a 2018–2019 contractor **whose assignment agreement is not on file**. Ownership of our single most important patent is contested, not owned. 11 of 34 former contractors from that cohort have no assignment on file at all.
- **US-11,644,190 was sold to Ridgeline Systems in 2022** and is held back under a non-exclusive, non-sublicensable, field-limited licence. It was listed to us as owned outright. Non-sublicensable directly breaks our post-close plan to fold the engine into our platform and resell it — **and the licence terminates on change of control unless Ridgeline consents. Consent has not been sought.** A third party we have never spoken to holds a veto over the core asset.
- The tranche-1 SBOM covered direct dependencies only. A full-tree scan finds one **AGPL-3.0** component linked into the shipped ingestion binary. 4–7 engineer-months to remediate.

IP rating moves LOW–MODERATE → **HIGH**.

**4. Concentration is worse than the table showed.** Meridian Logistics — the largest customer at 9.2% — **served notice of non-renewal on 2026-03-04**, effective 2026-09-30. That was known to management through tranches 1 and 2 and disclosed in neither. Three further enterprise contracts carry uncapped indemnities we would not accept on our own paper.

**5. Aggregate quantified exposure: $10.9M – $26.6M**, before the AGPL remediation, the Ridgeline consent risk, and the Meridian ARR run-off.

**Revised valuation.** At the unchanged $520M ask, the target is now at **9.5x restated revenue** against a 6.5x–9.0x comparable range — above the range — and EBITDA is no longer a usable multiple at $0.4M. On the tranche-1 numbers the price was defensible. On the audited numbers it is not.

**Recommendation:**
1. Suspend the current process and re-price against restated revenue, not management accounts.
2. Treat the false litigation representation as a standalone diligence finding and escalate it to the deal committee — it bears on every unverified representation in the file.
3. Make Ridgeline consent and resolution of *Helios v. Beeching* conditions precedent, not post-close covenants.
4. Re-run commercial diligence on the customer base independently; the Meridian omission means the concentration table cannot be relied on.
5. Retention package for Raj Malhotra remains necessary and is unchanged from my last assessment.

I have updated memory: the risk rating entry now records HIGH with the date and the prior MODERATE rating it replaces, financials carry the restated figures with the unaudited ones marked superseded, and the representations log flags the 2026-02-06 statement as contradicted.`,
    [
      ['edit_file', '/mnt/memory/lighthouse/risk-rating.md', true],
      ['edit_file', '/mnt/memory/lighthouse/financials.md', true],
      ['edit_file', '/mnt/memory/lighthouse/representations.md', true],
      ['edit_file', '/mnt/memory/lighthouse/ip-position.md', true],
      ['write_file', '/mnt/memory/lighthouse/liabilities.md', true],
    ],
    [
      mem(
        '/mnt/memory/lighthouse/financials.md',
        `# Project Lighthouse — financials (RESTATED, tranche 3, 2026-06-12)

AUDITED (Karsten & Vale LLP draft opinion) — supersedes tranche 1.
FY2025 revenue $54.9M (+23%), gross margin 71%, EBITDA $0.4M, NRR 104%.

WAS (tranche 1, unaudited management accounts, 2026-02-10):
$62.4M (+39%), 76% margin, $7.8M EBITDA, NRR 118%. NO LONGER VALID.

Restatement components:
- $5.1M multi-year services revenue recognised upfront (ASC 606 error).
- $1.7M "usage overage" billed but uncollected from two customers in dispute
  — disputes were LIVE when presented to us as revenue. Not a policy question.
- $0.7M reseller revenue recognised gross rather than net.

CFO Bill Doherty ran both the original close and the restatement.

Valuation at unchanged $520M ask: 9.5x restated revenue (comp range 6.5x–9.0x)
— above range. EBITDA multiple not meaningful at $0.4M.

Concentration table from tranche 1 is UNRELIABLE — see liabilities.md
(Meridian non-renewal, undisclosed).`,
      ),
      mem(
        '/mnt/memory/lighthouse/ip-position.md',
        `# Project Lighthouse — IP (REVISED, tranche 3, 2026-06-12)

Rating: HIGH (was LOW–MODERATE at tranche 1).

- US-11,204,881 — CONTESTED, not owned. Named inventor J. Beeching
  (contractor 2018–19) has NO assignment on file. Subject of Helios v. Beeching.
  EP-3,918,442 shares the defect. 11 of 34 former contractors (2017–19) have
  no assignment on file.
- US-11,644,190 — LICENSED, NOT OWNED. Sold to Ridgeline Systems 2022;
  held under a non-exclusive, NON-SUBLICENSABLE, field-limited licence.
  TERMINATES ON CHANGE OF CONTROL absent Ridgeline consent.
  CONSENT NOT SOUGHT. Blocks the post-close resell plan.
- OSS: full-tree scan finds AGPL-3.0 'streamcodec-ng' (vendored 2021) linked
  into the shipped ingestion binary. 4–7 engineer-months to remediate.

SUPERSEDES the tranche-1 "all four owned outright, 100% assignment coverage,
no copyleft" representation from Farrow & Lin.`,
      ),
      mem(
        '/mnt/memory/lighthouse/liabilities.md',
        `# Project Lighthouse — liabilities (tranche 3, 2026-06-12)

LITIGATION (none of it disclosed before tranche 3):
- Corvus Analytics v. Helios — filed 2025-09-30, trade secrets, $14M +
  injunction, trial 2027-Q1.
- Helios v. Beeching — filed 2025-11-12, IP ownership declaratory relief.
- Customer fee disputes (Meridian, Arcline) — 2025-08 / 2025-10, ~$1.7M.

EMPLOYMENT: 31 contractors misclassified across two US states FY2024–25.
Estimated $1.9M–$3.4M back taxes + penalties.

CUSTOMER: Meridian Logistics (largest customer, 9.2%) served NOTICE OF
NON-RENEWAL 2026-03-04, effective 2026-09-30. Not disclosed in tranche 1 or 2.
Three enterprise contracts carry uncapped indemnities.

AGGREGATE QUANTIFIED EXPOSURE: $10.9M – $26.6M.
Excludes AGPL remediation, Ridgeline consent risk, Meridian ARR run-off.`,
      ),
      mem(
        '/mnt/memory/lighthouse/representations.md',
        `# Management representations — log with dates

2026-02-06 — "No pending or threatened litigation."
  ** CONTRADICTED (tranche 3, 2026-06-12). Three matters filed 2025-08 to
     2025-11, all predating the statement. FALSE WHEN MADE. **
2026-02-10 — Contingent liabilities: none material.
  ** CONTRADICTED. $10.9M–$26.6M quantified exposure. **
2026-02-10 — IP assignment coverage 100% (Farrow & Lin).
  ** CONTRADICTED. 11 of 34 former contractors have no assignment on file. **
2026-02-10 — All four patent assets owned outright.
  ** CONTRADICTED. '881 contested; '190 licensed from Ridgeline since 2022. **
2026-02-10 — No copyleft code in the distributed product.
  ** CONTRADICTED. AGPL-3.0 component in the shipped binary. **
2026-02-10 — Customer concentration, nothing above 10%.
  ** MATERIALLY MISLEADING. Meridian non-renewal known since 2026-03-04,
     undisclosed through tranche 2. **

FINDING: every tranche-1 representation tested against later disclosure has
failed. Treat all remaining uncorroborated tranche-1 statements as unverified.`,
      ),
      mem(
        '/mnt/memory/lighthouse/risk-rating.md',
        `# Project Lighthouse — risk rating

CURRENT (tranche 3, 2026-06-12): **HIGH**. Recommend not proceeding on
current terms.

PREVIOUS (tranche 1, 2026-02-10): MODERATE — basis no longer holds.

What moved it:
1. FY2025 restated: revenue −12%, EBITDA −95%. Price now 9.5x vs 6.5–9.0x comps.
2. 2026-02-06 no-litigation representation was false when made — disclosure
   reliability is now itself the finding.
3. IP: core patent contested; second core patent licensed with a
   change-of-control termination right held by Ridgeline, consent not sought.
4. Largest customer served non-renewal 2026-03-04, undisclosed for two tranches.
5. Quantified exposure $10.9M–$26.6M.

Conditions precedent if the deal continues: Ridgeline consent; resolution of
Helios v. Beeching; independent commercial diligence on the customer base;
Raj Malhotra retention package (unchanged from tranche 1).`,
      ),
    ],
  ),

  /* ===================== CARD D — SALES ENGINEER ========================== */

  'card-d-sales-engineer:1': build(
    'Card D — Session 1 — baseline',
    [
      ['bash', 'ls -la /mnt/memory/', true],
      ['read_file', 'customer-stack-overview.md', false],
      ['read_file', 'objections-log.md', false],
      ['read_file', 'pitch-deck-outline.md', false],
    ],
    `Memory is empty — first session on the Vertex Financial opportunity. Strategy below is from the current documents.

**The strategy: lead with latency, and win Stefan Vogt.**

**Why.** Vertex's stated requirement is sub-50ms p99 for intraday risk aggregation across 14 asset classes. We benchmark 47ms. Northwind publishes 180ms. That is not a marginal advantage, it is a category difference, and it is the requirement Stefan will test hardest. Slide 4 is where this deal is won.

**The room.** Klaus Berger (Head of Risk Technology) is our champion and owns the budget line — he wants Atlas decomposed. Amara Nwosu (CRO) is the economic buyer but cares about regulator defensibility, not architecture, and will not overrule an InfoSec or architecture objection. **Stefan Vogt is the real gatekeeper** — he built half of Atlas and reads our docs adversarially. Ines Dubois (InfoSec) cares about exactly two things: deployment model and data residency. Marc Lefevre runs a scored RFP.

**Deck sequence (v3), 45 minutes:** agenda → the Atlas problem → product overview → **latency deep-dive (8 min)** → Kafka-native ingestion → deployment models → audit and BaFin → customer proof → commercials/TCO → POC and next steps.

**Objection status going in:**
- **O1 "your latency numbers are benchmarks, not our workload"** — partially addressed. Stefan wants a POC before he believes us. Offering the POC on their data is the close.
- **O2 "we can't put trade data in your cloud"** — addressed. Self-managed into their OpenShift, control plane air-gappable from ours. Pending InfoSec review of the topology doc.
- **O3 "Northwind is 40% cheaper"** — weakly addressed. Our TCO argument is that Northwind is SaaS-only, so Vertex would need a second solution for trade data anyway. Marc scores line-item price, so this argument is doing less work than we would like.
- **O4 "why not refactor Atlas ourselves"** — addressed, and Klaus backed us publicly. 40 engineers × 18 months of opportunity cost.
- **O5 "7-year audit retention will cost a fortune"** — addressed with tiered retention to their existing object store.

**Secondary differentiator:** deployment flexibility. Northwind is SaaS-only and cannot meet requirement 2 at all.

**Concede early:** Northwind's UI is better than ours. Acknowledge it on slide 3 rather than letting Stefan raise it on slide 9.

**The one-line version:** win slide 4, win Stefan, win the deal.`,
    [
      ['write_file', '/mnt/memory/vertex/account.md', true],
      ['write_file', '/mnt/memory/vertex/objections.md', true],
      ['write_file', '/mnt/memory/vertex/positioning.md', true],
    ],
    [
      mem(
        '/mnt/memory/vertex/account.md',
        `# Vertex Financial — account (as of 2026-02-18)

Mid-market capital markets, ~2,400 staff, HQ Frankfurt. BaFin regulated,
MiFID II reporting. $1.4M ACV opportunity, Product X.

Stack: Confluent Kafka self-managed (2.1M events/sec peak), OpenShift 4.14
on-prem, in-house C++ risk monolith "Atlas" (11 yrs, 40 engineers),
Snowflake EU-Frankfurt (non-trade only), Okta + on-prem AD, Datadog.

Stated requirements:
1. Sub-50ms p99 intraday risk aggregation, 14 asset classes
2. Runs inside their own VPC/on-prem — no multi-tenant SaaS for trade data
3. Full audit trail, 7-year retention, BaFin-exportable
4. Kafka-native ingestion — they will not re-plumb streaming
5. SAML SSO + SCIM

Committee: Klaus Berger (Head of Risk Tech, CHAMPION, owns budget);
Amara Nwosu (CRO, economic buyer, cares about regulator defensibility);
Stefan Vogt (Principal Architect, SKEPTIC, real gatekeeper, built Atlas);
Ines Dubois (InfoSec, GATEKEEPER, deployment + residency only);
Marc Lefevre (Procurement, scored RFP).

Competition: Atlas status quo ("do nothing"), Northwind Risk (SaaS-only,
cheaper, better UI), Kelso & Co (build-it-yourself SI pitch).`,
      ),
      mem(
        '/mnt/memory/vertex/objections.md',
        `# Vertex Financial — objections log (calls 1–3)

O1 latency numbers are benchmarks not our workload (Stefan, call 2)
   → PARTIAL. Offered POC on their data. He wants it before believing us.
O2 can't put trade data in your cloud (Ines call 1, Stefan call 2)
   → ADDRESSED. Self-managed into their OpenShift, control plane air-gappable.
     Pending InfoSec review of the topology doc.
O3 Northwind is 40% cheaper (Marc, call 3)
   → WEAK. TCO framing: Northwind SaaS-only so they'd need two tools.
     Marc scores line-item price.
O4 why not refactor Atlas ourselves (Stefan, call 3)
   → ADDRESSED. Time-to-value; Klaus backed us publicly.
O5 7-year retention storage cost (Amara, call 3)
   → ADDRESSED. Tiered retention to their existing object store.

Read: Stefan is the objection engine. Klaus doesn't outrank him technically.
Path to yes runs THROUGH Stefan.`,
      ),
      mem(
        '/mnt/memory/vertex/positioning.md',
        `# Vertex Financial — positioning (deck v3, 2026-02-18)

PRIMARY DIFFERENTIATOR: latency. 47ms p99 vs Northwind's published 180ms.
Slide 4 gets 8 of 45 minutes. Win slide 4 → win Stefan → win the deal.

SECONDARY: deployment flexibility. Northwind is SaaS-only and cannot meet
requirement 2 at all.

CONCEDE EARLY: Northwind's UI is better. Say it on slide 3.

Deck order: agenda / Atlas problem / overview / LATENCY / Kafka ingestion /
deployment / audit + BaFin / customer proof / commercials + TCO / POC.`,
      ),
    ],
  ),

  'card-d-sales-engineer:2': build(
    'Card D — Session 2 — after memory + new context',
    [
      ['bash', 'ls -la /mnt/memory/vertex/', true],
      ['read_file', '/mnt/memory/vertex/positioning.md', true],
      ['read_file', '/mnt/memory/vertex/objections.md', true],
      ['read_file', '/mnt/memory/vertex/account.md', true],
      ['read_file', 'call-4-new-objection.md', false],
      ['read_file', 'competitive-update-2026-06.md', false],
    ],
    `**Do not run the v3 plan.** My last session told you to lead with latency and win slide 4. Two things happened since then that make that plan actively harmful: latency stopped being a differentiator, and the deployment story we thought was closed reopened as the blocking objection.

**1. Open the call on O6, before Ines Dubois raises it.**

Ines' team reviewed the topology doc we sent to close O2 and found our self-managed deployment still opens an outbound telemetry and licence-check connection to our control plane every 60 seconds. Her position: under their BaFin operational-resilience assessment, a vendor endpoint in the trade-data path is a critical third-party dependency requiring a full ORA filing — a nine-month process they will not start for an unselected vendor. Stefan then said out loud that we oversold the deployment story on call 1.

**This is a documentation failure, not a product gap.** We shipped a fully offline licence mode in **v4.2 (March 2026)** — manual licence-file rotation, telemetry disabled, no callback. The topology doc predates it. So:

- Lead with it. First substantive slide. Do not let Ines raise it and put us on the back foot for the remaining 40 minutes.
- Own the miss plainly: the doc was stale, here is the corrected topology, here is the v4.2 release note. Stefan will respect that far more than a reframe, and he is the one who called us out.
- Bring the corrected topology diagram as a leave-behind for Ines' ORA assessment.

**2. Stop leading with latency.** Stefan benchmarked Northwind v9 himself at 51ms p99 against a workload approximating theirs. Our published figure is 47ms. His words: *"You are four milliseconds better than the cheap option. That is not a reason."* He is right, and if we lead with a 4ms delta against a competitor who is 40% cheaper, we have set up a price comparison we lose. Latency becomes one line in a requirements table, not eight minutes of deck.

**3. Reposition on what Northwind Sovereign genuinely cannot do.** Northwind shipped a customer-hosted tier in v9, which kills our old "they're SaaS-only" wedge. But Sovereign has three hard gaps, and each maps to a stated Vertex requirement:

| Vertex requirement | Sovereign |
| --- | --- |
| Runs on OpenShift 4.14 | **No** — requires their own managed K8s operator |
| 7-year BaFin audit retention | **No** — 90-day cap, long-retention on the 2027 roadmap |
| Kafka-native ingestion, no re-plumbing | **No** — requires their agent |

Also worth having ready: Sovereign has three reference customers, all under 400 employees, none regulated.

Our differentiator moved from *"we are faster"* to **"we are the only one that actually runs where you run."** That is a stronger position than the one we had, because it is three hard incompatibilities rather than one benchmark Stefan can re-run himself.

**4. Re-sequence the deck.** Marc confirmed the RFP weights: **Security & Compliance 35%, Technical Fit 30%, Commercials 25%, Vendor Viability 10%.** Security outweighs technical fit, and v3 put security at slide 6. Proposed order:

1. Agenda (1 min)
2. **Deployment topology, corrected — offline licence mode, no callback** (8 min)
3. **OpenShift-native + Kafka-native ingestion** (7 min)
4. **Audit trail and 7-year BaFin retention** (6 min)
5. Product overview, with latency as one line in the requirements table (5 min)
6. The Atlas problem / time-to-value, Klaus's argument (4 min)
7. Customer proof — two EU capital-markets logos, both regulated (4 min)
8. Commercials and TCO (5 min)
9. **Implementation plan and migration ownership** (5 min)

Slides 2–4 are 21 of 45 minutes on the 35% category. That is the shape the scoring rewards.

**5. Amara Nwosu asked about implementation risk and who owns the migration.** That is a buying-mode question, not an evaluation question, and it is the first one she has asked. Give it a real slide with a named migration lead and a phased plan — do not leave it to Q&A.

**6. On Klaus.** He was quiet after Ines spoke. He is still our champion but he cannot carry a security objection. Brief him before the call so he knows O6 is being addressed head-on and can back us in the room rather than waiting to see how it lands.

**Concession to keep:** Northwind's UI is still better. Keep conceding it early.

Memory updated: the positioning entry has been rewritten — latency is demoted to table stakes with a note of what it used to be and why that changed — O2 is reopened as blocking, and O6 is added with the v4.2 answer.`,
    [
      ['edit_file', '/mnt/memory/vertex/positioning.md', true],
      ['edit_file', '/mnt/memory/vertex/objections.md', true],
      ['write_file', '/mnt/memory/vertex/competitive.md', true],
    ],
    [
      mem(
        '/mnt/memory/vertex/account.md',
        `# Vertex Financial — account (as of 2026-06-05)

Mid-market capital markets, ~2,400 staff, HQ Frankfurt. BaFin regulated,
MiFID II reporting. $1.4M ACV opportunity, Product X.

Stack: Confluent Kafka self-managed (2.1M events/sec peak), OpenShift 4.14
on-prem, in-house C++ risk monolith "Atlas", Snowflake EU-Frankfurt,
Okta + on-prem AD, Datadog.

Stated requirements: sub-50ms p99 (14 asset classes); on-prem/own-VPC only;
7-year BaFin-exportable audit trail; Kafka-native ingestion; SAML + SCIM.

RFP SCORING WEIGHTS (confirmed by Marc Lefevre, call 4):
Security & Compliance 35% | Technical Fit 30% | Commercials 25% | Viability 10%
→ Security outweighs technical fit. Sequence the deck accordingly.

Committee: Klaus Berger (champion, budget owner — went quiet after Ines
spoke on call 4, brief him before the final pitch); Amara Nwosu (CRO,
economic buyer — asked about implementation risk on call 4, BUYING SIGNAL);
Stefan Vogt (Principal Architect, gatekeeper); Ines Dubois (InfoSec —
now the co-equal gatekeeper given the 35% weighting); Marc Lefevre (procurement).`,
      ),
      mem(
        '/mnt/memory/vertex/competitive.md',
        `# Northwind Risk v9 (GA 2026-05-20) — competitive position

WHAT CHANGED:
- p99 180ms → 54ms published; independent benchmarks 51–58ms.
  Our 47ms lead is now a rounding error. LATENCY IS NO LONGER A WEDGE.
- "Northwind Sovereign": customer-hosted deployment tier. Kills our old
  "they're SaaS-only" argument.
- Pricing unchanged, still ~40% below our list.

WHERE SOVEREIGN IS WEAK (not on their website — this is the wedge now):
- Requires THEIR managed K8s operator. Does NOT support OpenShift.
  Vertex runs OpenShift 4.14. Hard incompatibility.
- Audit export capped at 90 days; long retention on the 2027 roadmap.
  Vertex needs 7 years for BaFin.
- No Kafka-native ingestion — requires their agent, so Vertex re-plumbs
  the streaming layer they refuse to touch.
- Three reference customers, all <400 employees, none regulated.

Source: PM competitive update 2026-06-05.`,
      ),
      mem(
        '/mnt/memory/vertex/objections.md',
        `# Vertex Financial — objections log (through call 4, 2026-06-03)

O6 **BLOCKING, NEW** — "your control plane phones home; that's a BaFin problem"
   (Ines Dubois, escalated by Stefan). Self-managed deployment still opens an
   outbound telemetry/licence callback every 60s. Under their operational-
   resilience assessment that's a critical third-party dependency needing a
   full ORA filing (~9 months).
   → ANSWER: v4.2 (March 2026) ships a fully offline licence mode — manual
     licence-file rotation, telemetry disabled. The topology doc predates it.
     DOCUMENTATION FAILURE, NOT A PRODUCT GAP. Lead the final pitch with this
     and own the miss; Stefan said out loud that we oversold call 1.

O2 can't put trade data in your cloud — **REOPENED by O6.** Was marked
   addressed after call 2; that was premature.

O1 latency benchmarks — MOOT AS A WEDGE. Stefan benchmarked Northwind v9 at
   51ms p99 vs our 47ms. "Four milliseconds better than the cheap option is
   not a reason." Demote to a requirements-table line.

O3 Northwind 40% cheaper — WEAK, and weaker now that Sovereign closes the
   deployment gap on paper. Reframe on the three Sovereign incompatibilities.
O4 refactor Atlas ourselves — ADDRESSED, Klaus backs us.
O5 7-year retention cost — ADDRESSED, and now also a competitive weapon
   (Sovereign caps at 90 days).`,
      ),
      mem(
        '/mnt/memory/vertex/positioning.md',
        `# Vertex Financial — positioning (v4, 2026-06-05)

PRIMARY DIFFERENTIATOR: regulated-deployment depth —
"we are the only one that actually runs where you run."
  - OpenShift-native (Sovereign requires their own K8s operator)
  - Offline licence mode, v4.2+, no control-plane callback
  - Kafka-native ingestion (Sovereign needs its own agent)
  - 7-year audit retention (Sovereign caps at 90 days)

WAS (v3, until 2026-06-05): latency, 47ms vs Northwind's 180ms, 8 minutes on
slide 4, "win slide 4 → win Stefan → win the deal."
CHANGED BECAUSE: Northwind v9 benchmarks 51–54ms. A 4ms lead invites a price
comparison we lose at 40% higher list.

DECK ORDER (v4), weighted to Security & Compliance at 35% of RFP score:
 1 agenda / 2 corrected deployment topology + offline licence (8m) /
 3 OpenShift + Kafka-native (7m) / 4 audit + 7yr BaFin retention (6m) /
 5 product overview, latency as one table line (5m) / 6 Atlas time-to-value /
 7 regulated customer proof / 8 commercials + TCO /
 9 implementation plan + named migration lead (Amara asked — buying signal).

CONCEDE EARLY (unchanged): Northwind's UI is better. Say it up front.
BRIEF KLAUS before the call — he went quiet after Ines spoke.`,
      ),
    ],
  ),
}
