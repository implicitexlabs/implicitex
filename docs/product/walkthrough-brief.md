# First-User Walkthrough Brief

**ImplicitEx — Gate 5 · Pre-cutover comprehension test**

---

## Observer Rules

Say as little as possible. The goal is to learn what the site communicates
on its own — not what you can explain.

When the tester asks a question, do not answer it. Ask instead:

> "Where would you expect to find that answer?"

If they find it themselves, observe. If they cannot, record the failure.

Do not pull out a clipboard. Do not read questions mechanically. Take notes
quietly. Let him explore. Let him talk.

---

## URL

```
https://implicitex-236f2.web.app
```

---

## Prediction Sheet

Fill this out **before the tester arrives**.

```
I think the tester will:

[ ] Click Connect Wallet first
[ ] Click Proof in the footer
[ ] Understand the 1% fee without help
[ ] Understand what USDC is
[ ] Understand what Polygon is
[ ] Ask about Ethereum support
[ ] Ask about other tokens
[ ] Notice the Contact page
[ ] Hesitate at the wallet prompts
[ ] Hesitate at the Proof / Verification label mismatch
[ ] Ask what "non-custodial" means
[ ] Trust himself to send $10

Other predictions:
_______________________________________________
_______________________________________________
```

```
What actually happened:
_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________
```

---

## Observation Table

Record the first two clicks and first page visited before anything else.
Then continue with one row per event.

```
First click:  _______________________________
Second click: _______________________________
First page visited after homepage: __________
```

```
Time  | Action              | Hesitation / Question       | Resolved?
------|---------------------|-----------------------------|----------
      |                     |                             |
      |                     |                             |
      |                     |                             |
      |                     |                             |
      |                     |                             |
      |                     |                             |
      |                     |                             |
      |                     |                             |
```

Anything resolved through the site = the site is working.
Anything requiring your intervention = signal.

---

## Before He Arrives

Tell him almost nothing:

> "I'm working on a web product and I'd like you to spend about 5–10 minutes
> looking around it. Afterwards I'll ask a few questions."

Stop there. Do not tell him it's a USDC transfer tool. Do not explain
Polygon, MetaMask, the fee model, or the Proof page.

One of the debrief questions is "What do you think this is?" — you want the
site to answer that, not you.

Prepare a wallet you control with a few dollars of USDC and enough MATIC for
gas. Keep it out of sight. Do not mention it during Phase A.

---

## Phases

**Phase A — Discovery (5–10 minutes, no wallet)**

Hand him the URL. Say:

> "Take a look around."

Then go quiet. You are testing: homepage, FAQ, Proof, Contact, Legal,
navigation, and comprehension. A wallet is irrelevant to these first
impressions. Phase A ends when he stops exploring or asks what to do next.

**Phase B — Connect Wallet (optional)**

Only after Phase A is complete. Ask:

> "If you wanted to use this, what would you do next?"

Then hand him the wallet you prepared. Do not coach. Watch.

**Phase C — Tiny transfer (optional)**

If Phase B goes cleanly: $1 USDC, your wallet, a recipient address you
control. The goal is to observe his mental model through the prompts and
confirmation flow. Gate 4 already verified the contract.

---

## Known Watch Items

- **Wallet prompts** — does the two-confirmation flow make sense unprompted?
- **Blockaid warning** — does he find "Proof" when he sees a wallet warning?
- **Proof / Verification label** — does "Verification" h1 cause confusion after clicking "Proof" in the footer?

---

## Signal vs. Noise

| Observation | Classification | Action |
|---|---|---|
| Hesitation → self-resolution | Noise | Site is working |
| Hesitation → question | Signal | Something the site isn't answering |
| Confusion → no self-resolution | Fix | Resolve before domain cutover |

---

## Cutover Threshold

Define this before the session. Not after.

**Cutover proceeds if:**

- The tester can explain what ImplicitEx does in their own words
- No Critical finding emerges (see classification below)
- Trust findings, if any, have a known fix that does not require rebuilding architecture

**Cutover does not proceed if:**

- The tester cannot explain what the product does after 10 minutes of free exploration
- A Critical finding emerges that would prevent or abort a transfer
- A Trust finding reveals a structural gap that does not yet have a home (a page, section, or entry that would fix it)

**Friction that does not block cutover:**

- Hesitation that self-resolves (site is working)
- Confusion about Polygon, USDC, or gas that LEARN already addresses
- Blockaid wallet warning (known; mitigation exists in FAQ and Proof)
- Preference differences (tester would phrase something differently)
- Questions that have answers on the site, even if the tester didn't find them immediately

The walkthrough is not a search for perfection. It is a test of whether
a stranger can understand enough to use the product confidently.

---

## Primary Debrief

Four questions. Ask them casually. Let the answers run.

**1. What do you think ImplicitEx does?**

**2. What made you most hesitant?**

**3. Would you trust yourself to send $10 through it? Why or why not?**

**4. If you were going to warn me about one thing before launch, what would it be?**

Question 4 gets the most honest feedback. People give their best criticism
when framed as helping you avoid a mistake.

---

## Extended Question Bank

Use only if a topic doesn't surface naturally in the primary debrief.

**Comprehension**
- What is USDC, as far as you can tell from the site?
- What is Polygon, as far as you can tell from the site?
- What does "non-custodial" mean to you — did the site tell you, or did you already know?
- How does the fee work? Walk me through what you'd pay to send someone $100.
- What happens to your funds between when you send and when they arrive?

**Navigation and discovery**
- Did you find anything that surprised you?
- Was there anything you looked for and couldn't find?
- Did you click anything in the footer? If so, what?
- Did you visit the Proof page? What did you make of it?

**Trust and friction**
- Was there any moment where you weren't sure what to do next?
- If your wallet showed a warning that the contract was "untrusted," what would you do?
- How would you verify this platform is legitimate before sending real money?
- Is there anything on this site you didn't believe, or wanted to verify independently?

**Expectations and gaps**
- Was there anything you expected to see that wasn't there?
- Is there anything you'd want to know before sending a transfer that the site didn't tell you?
- Did you expect this to support Ethereum, other networks, or other tokens?

**Recovery and support**
- If something went wrong with a transfer, what would you do?
- Did you find a way to contact anyone?

**Closing**
- Would you use this? If yes, for what? If no, what's missing?
- What would you tell someone else this does, in one sentence?

---

## Most Important Observation

After the session, before classifying anything else, write one thing.

```
_______________________________________________

_______________________________________________

_______________________________________________
```

---

## After the Session

1. Note every hesitation point and question verbatim.
2. Sleep on it before making changes.
3. Classify each observation:

```
Critical     — would stop a transfer
Trust        — would make someone hesitate
Cosmetic     — annoying but doesn't change behavior
```

4. Fix signals. Update FAQ, Proof, Contact, or copy as needed.
5. Make domain cutover decision.

**Domain cutover is held until after this walkthrough passes.**
