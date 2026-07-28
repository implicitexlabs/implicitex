# ImplicitEx Social Distribution Strategy

Last updated: 2026-07-27

---

## Core principle

Marketing for ImplicitEx is not a campaign. It is a system that produces output
from work already being done. Content should not compete with product
development — it should derive from it.

Do not think of social accounts as places to market ImplicitEx.
Think of them as distribution channels that eventually happen to feature ImplicitEx.

The audience is not "people who love crypto." The audience is "people who
receive money online." Those two populations overlap but are not the same.
The second group is far larger.

---

## Founder identity stance

The platform is the product, not the founder.
People sending money ask: Does this work? Is it secure? Is it fast?
Those questions are about the product and the organization.

The strongest marketing asset is the process, not the personality:
- One isolated change. One commit. One production build. One deploy.
- Verification before the next change.
- Engineering discipline shown publicly, not just practiced privately.

A development update every few weeks:
> Version 0.8 is live. Coin Card now supports... Here are three bugs we fixed.
> Here's what we're building next.

No selfies. No lifestyle. No "look at me."
Evidence that the company is alive, disciplined, and improving.

---

## Platform tier system

### Tier 1 — Start now

**X (Twitter)**
Founders, developers, investors, and crypto-adjacent users are already here.
Use for: product updates, development decisions, engineering philosophy,
release notes, evidence-based observations about the space.
Character: same as ImplicitEx copy grammar — declarative, operational, no hype.

**YouTube**
Long-form authority. 5–15 minute videos:
- Digital payments and stablecoin mechanics
- Building a startup in public
- Creator economics
- Security architecture decisions
- ImplicitEx development milestones

**YouTube Shorts (same channel as YouTube)**
Quick demonstrations:
- "Here's how someone receives 10 USDC in 20 seconds."
- "Three mistakes creators make accepting payments."
- Portal walkthroughs from cold start to completed transfer.

**TikTok**
Discovery. Fast-paced, authentic:
- Interesting problems and experiments
- Behind-the-scenes development
- Real creator stories
- The unexpected details of building a payment product

---

### Tier 2 — Once producing Tier 1 content consistently

**Instagram**
Visual identity:
- Portal UI screenshots
- Product animations
- Development updates
- Polished Coin Card imagery
- Evolution of the interface over time

**LinkedIn**
Freelancers, agencies, and B2B:
- Product milestones framed for business context
- Distribution for the AI agent market
- Trust and compliance observations

---

### Tier 3 — Reserve the name only

**Facebook**
Large audience but not the primary domain for this product's early adopters.
Reserve the account. Do not invest production time initially.

**Reddit**
Participate more than promote. Useful in technical communities (r/ethereum,
r/web3) and creator communities. Avoid self-promotion framing.

---

## Content pipeline

Evening planning walks are the raw material. The observation: these conversations
already contain strategy, product architecture, security reasoning, design
decisions, and market thinking. The gap is a pipeline to transform them into
distributable content.

**Walk → content pipeline (target state):**

1. Record audio during walks
2. Transcribe
3. Extract 10–20 distinct ideas or insights
4. Draft YouTube scripts for each substantial topic
5. Extract 60-second clips for Shorts / TikTok
6. Generate X posts from key observations
7. Produce LinkedIn articles from business-relevant findings
8. Queue everything for approval
9. Publish on approval — no invention required

One two-hour walk can generate a week of content. The content creator is not
creating content — they are documenting work already being done.

**Content categories derivable from existing work:**

- Why a specific technical decision was made
- What a particular product principle protects against
- How a security problem was identified and resolved
- What deploying a non-custodial payment product actually requires
- The difference between ImplicitEx and existing tools
- Evidence from real transfers (redacted for privacy)

---

## AI agent market — different acquisition model

AI agents do not need persuasion. They need a stable, deterministic API.

Marketing to this market means:
- Presence in developer documentation ecosystems
- Awareness when developers are wiring agent capabilities
- Mention in agent capability lists, registries, and forums
- API stability that earns trust through consistent behavior

The acquisition channel is not social content. It is documentation quality,
API reliability, and developer community presence.

Watch: agent communication platforms (e.g., AgentMail), developer forums,
AI agent marketplaces. Understand how agents discover payment capabilities
before building toward that market.

---

## Review workflow using Claude credits

Do not use Claude credits to replace what Claude Code already does.
Use them where they provide leverage before Codex writes code:

- Adversarial security reviews of new features
- Architectural blind spots and scalability challenges
- Stress-testing Coin Card's future feature set
- Threat models and abuse case enumeration
- Marketing positioning critique from multiple customer perspectives

Workflow:
```
Antoine + Claude Code  — define strategy, priorities, evaluate tradeoffs
          ↓
Claude adversarial review  — find weaknesses, challenge assumptions
          ↓
Codex  — implement only after design survives both reviews
```

Bring Claude's findings back for reconciliation. Only change what
deserves to change after both reviews.

---

## Homepage evolution plan

The product is now strong enough to be shown, not described.

**Phase 1 — Screenshot library**
Every portal milestone: capture pristine screenshots with canonical demo data.
No debugging labels. No placeholder values. No temporary features.

Folder structure:
```
/marketing-assets/
    /portal/
        send/
        recipients/
        activity/
        coin-card/
        settings/
        connected/
        error-states/
    /devices/
        iphone/
        ipad/
        desktop/
    /brand/
        logo/
        icons/
        backgrounds/
```

**Phase 2 — Device frames**
Create once: iPhone, iPad, MacBook device frames.
Drop current screenshots into them. When UI changes, swap the screenshot, not
the whole composition. Never ask an AI to generate a device containing the
portal. Generate the frame once; the portal provides its own screenshots.

**Phase 3 — Marketing compositions**
Hero: one iPhone + one iPad, slight overlap, portal running, subtle reflections,
world map. No watches. No extra devices. The product stands on its own.

Coin Card: phone displaying Coin Card. Physical card floating beside it.

**Phase 4 — Homepage assembly**
Only after all assets exist. Building a page from components, not inventing art.

**PWA hero animation (future):**
1. iPhone Home Screen appears
2. ImplicitEx icon tapped
3. Lettermark loader pulses
4. Portal fades in
5. Persistent display appears

Silent. Looping. Five seconds.
Shows it behaves like an app without saying it is one.

**Canonical demo data (use across all assets):**
```
Sender address:    0xf614...0f1d
Recipient address: 0x5466...7698B
Amount:            100.00 USDC
Recipient receives: 99.00 USDC
Fee:               1.00 USDC
Purpose:           Consulting Invoice
Reference:         INV-2026-001
Memo:              July Design Review
```

Same data. Every screenshot. Every animation. Every promotional render.
Consistency makes the platform feel polished even before polish work begins.

---

## What a marketing system looks like at scale

Not a content creator spending hours writing posts.
Not a full-time marketer.

A system where:
- One productive engineering day generates a week of content
- AI agents transform development logs into social posts, release notes,
  YouTube scripts, and X posts
- Human role: review and approve output generated from work already done
- Marketing scales with development instead of competing with it

Build toward this. Do not require it now.
