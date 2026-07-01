# ImplicitEx — Agent Distribution System

Last updated: 2026-06-30

---

## Strategic mandate

**We are not building a cold-calling business.**

The economics of a 1% transaction revenue model do not support artisanal customer
acquisition. If an hour of outreach is worth $25, each customer acquired must
eventually produce at least $25 in revenue. At 1%, that requires $2,500 in transfer
volume per customer before the outreach pays for itself.

This is why human-scale, door-to-door outreach is not the growth strategy.

The correct framing:

> "How do I put ImplicitEx in front of the right people while I am asleep?"

Human labor executes strategy and judgment. Agents execute reach, research,
personalization, and follow-through.

---

## What agents replace

Agents replace repetitive, time-consuming, and demoralizing tasks:

- Scanning crypto communities for relevant conversations
- Identifying people already publishing wallet addresses or accepting crypto
- Scoring prospects by fit
- Drafting personalized outreach
- Publishing niche-specific landing pages
- Following up consistently
- Monitoring for product-relevant news and discussion

Agents do NOT replace:

- Strategic judgment
- Relationship escalation
- Support for complex or sensitive cases
- Product decisions
- Legal and compliance review
- The human capacity to notice something unexpected

---

## Tactical constraint

**Do not automate at massive scale until one niche shows pull.**

Agents should start with precision, not volume. The agent advantage is not
"send more." It is "learn faster."

1,000 sloppy contacts teach you less than 50 carefully segmented contacts
with measured replies.

**Correct automation sequence:**

1. Find 50–500 prospects in one niche
2. Score by pain signal (wallet address published, USDC discussion, payment friction language)
3. Create niche-specific landing page
4. Send small batch (20–50) with agent-drafted, human-reviewed messages
5. Measure reply rate, objection language, trust concerns
6. Use findings to rewrite copy, pricing, and onboarding
7. Only then scale volume

---

## Agent departments

### Market Scout Agent

**Role:** find markets, communities, and individuals who already have the problem.

Monitors:

- X/Twitter (USDC, stablecoin payments, creator economy, freelance payments)
- Reddit (r/ethereum, r/usdc, r/freelance, r/creatoreconomy, niche subreddits)
- Discord (crypto communities, creator DAOs, open-source projects)
- Farcaster and other Web3 social platforms
- Crypto forums and newsletters
- Websites already publishing wallet addresses

Outputs:

- Prospect list (person, platform, observed pain signal, niche)
- Community summaries ("30 creators in this thread discussing payment censorship")
- Opportunity alerts: new distribution channel, new relevant community

---

### Fit Scoring Agent

**Role:** rank prospects by likelihood of needing Coin Card.

Scoring signals:

- Already publishing a public wallet address
- Crypto language in bio or posts
- Donation/support model in use
- International clients or cross-border payment discussion
- Invoice friction language
- Digital product sales
- Creator audience of any size
- Technical credibility (developer, builder, open-source maintainer)

Outputs per prospect:

- Fit score (high / medium / low)
- Primary pain signal observed
- Recommended tier (Free embed, Registered, Business setup)
- Suggested landing page

---

### Offer Agent

**Role:** match each prospect to the correct message and landing page.

Offer templates by niche:

- **Creator**: "Accept USDC from your audience without locking them into a new platform"
- **Freelancer**: "Send clients a verified payment link that looks professional"
- **Agency**: "Give clients a branded receipt for every USDC payment you receive"
- **Open source maintainer**: "A verified donation card that shows donors exactly where their support lands"
- **Local / Web3 business**: "A USDC receiving page that handles verification and receipts"

Each template maps to a niche-specific landing page, not the generic homepage.

---

### Copy Agent

**Role:** write personalized first-contact messages. Not spam blasts.

Message standard:

> "I noticed you already accept crypto / publish a wallet / support direct payments.
> I built something that makes that flow safer and more professional."

Messages must:

- Reference something specific about the prospect
- Name the pain before offering the solution
- Not use "buy," "purchase," "subscribe," or "sign up" in the first message
- Link to a landing page, not the transfer portal
- Sound like a person, not a form letter

Messages must not:

- Be identical across prospects in the same niche
- Make claims ImplicitEx cannot support
- Request a follow, share, or repost
- Claim proof the prospect has not seen

---

### Landing Page Agent

**Role:** generate and maintain niche-specific landing pages.

Each niche gets its own page with:

- Problem language from that community
- Relevant Coin Card example
- Tier recommendation for that niche
- Proof element (verified transaction, real transfer hash, screenshot)
- Clear next step (create free Coin Card, or contact for Business setup)

Niche pages (starting set):

- `/coincard/creators`
- `/coincard/freelancers`
- `/coincard/agencies`
- `/coincard/open-source`
- `/coincard/local-business`

---

### Onboarding Agent

**Role:** guide new users through card creation and first embed.

Handles:

- "How do I connect my wallet to a Coin Card?"
- "What is Polygon?"
- "How do I put this on my website?"
- "What happens when someone sends through my card?"
- "How do I update my receiving address?"

Escalation path: anything involving funds, contract addresses, or unexpected behavior
routes to human support.

---

### Support Agent

**Role:** handle common post-onboarding questions and receipts.

Handles:

- "Where is my receipt?"
- "The sender says they transferred but I don't see it"
- "I need to change my wallet address"
- "How do I pause my card?"
- "How do I cancel a transfer?" (answer: you cannot, non-custodial, on-chain)

Escalation: fund disputes, suspicious activity, and requests involving private key
material go immediately to human review.

---

### Relationship Agent (CRM)

**Role:** maintain records of contacts, interactions, and relationships.

Tracks:

- Influencers, developers, creators, journalists, researchers
- Previous interaction history
- Interest signals and relevance score
- Whether they have been contacted and by which offer
- Whether they responded and what they said

This becomes the company's CRM. Do not make contact without checking this first.
Do not send a second message from a different offer if the first was ignored.

---

## What agents must not do

- Mass DM blasts with no personalization
- Follow/unfollow schemes
- Fake engagement (likes, reposts, replies that don't add value)
- Claim ImplicitEx has features or users it does not have
- Engage in discussions about competitors without authorization
- Post without human approval of the first batch in any niche

---

## Infrastructure requirements

### Local agent runtime (Mac Studio recommended)

- 128 GB unified memory minimum for simultaneous agents + local models
- Orchestrator: n8n, LangGraph, or Temporal
- Local models: Ollama / LM Studio (Llama, Qwen, Mistral for routine tasks)
- API models: Claude Sonnet for judgment-required tasks
- Memory: PostgreSQL + pgvector for prospect and relationship data
- Scheduling: cron + agent orchestrator

### Agent hierarchy

```
Strategic Director (human)
    |
    +-- Market Scout Agent
    |       └── Fit Scoring Agent
    |
    +-- Offer Agent
    |       └── Copy Agent
    |
    +-- Landing Page Agent
    |
    +-- Onboarding Agent
    |       └── Support Agent
    |
    +-- Relationship Agent (CRM)
```

---

## Performance targets (first 90 days)

| Metric | Target |
|--------|--------|
| Niches researched | 5 |
| Prospects identified per niche | 100–500 |
| Outreach batches sent | 5 (one per niche) |
| Reply rate threshold to continue niche | >5% |
| Niche-specific landing pages live | 5 |
| Free cards created from agent outreach | 50+ |
| Registered cards from agent outreach | 5+ |
| Business inquiries from agent outreach | 2+ |

If no niche clears the 5% reply threshold after 50 contacts, reassess offer
language before scaling volume.

---

## Economic bridge

The agent system is not expected to immediately generate transaction volume
at the scale required for $25k/year.

The economic bridge while volume grows:

1. **Aden Media Group setup services** (Coin Card Business tier)
   33 customers at $750 setup = $25,000
   These can be found and qualified by agents, closed by a human.

2. **Platform transaction revenue** (Coin Card Free + Registered)
   Grows as more cards are embedded and active.
   Target: agent-placed cards in 5 niches, each generating modest but cumulative volume.

3. **Registered subscription revenue**
   Grows as Free users who become attached to the product upgrade.

These three streams compound. The agent system accelerates all three simultaneously.
