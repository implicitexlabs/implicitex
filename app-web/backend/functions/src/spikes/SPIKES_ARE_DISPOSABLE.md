# Spike functions are disposable

**Nothing in this directory is promoted into production.**

Spike functions answer architectural questions under controlled conditions.
Once a question is answered, the spike retires. Production implementations
are written from the architecture documents, not copied from spike code.

## Why this rule exists

Spike code is optimized for observability and fast iteration, not for
production correctness. It uses:

- Isolated fixture collections (`spike_registry`, `spike_invocations`)
- Diagnostic headers (`X-Spike-Source: function`)
- Permissive emulator rules
- Demo project IDs (`demo-spike`)

None of those belong in production. A spike function that "works" in the
emulator has not been reviewed for:

- IAM boundaries and service-account isolation
- Correct error handling under production failure modes
- Rate limiting and authentication
- Cache policy
- Structured logging for production observability
- Compliance with `COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md`

## When a spike is done

A spike is done when the evidence document is complete and the corresponding
checklist item in `COIN_CARD_BACKEND_ARCHITECTURE_V1.md` is marked.

The spike function and its fixtures can be deleted at that point. The
evidence document is what matters — not the spike code that produced it.

## Current spikes

| Directory / file | Gate it closes |
|---|---|
| `coincard-registry-read-spike.js` | Hosting → `registryRead` rewrite works while exact static files retain priority |
