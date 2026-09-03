# Coin Card Public Identity and Legacy Migration V1

Status: invariant frozen; production identity migration not yet authorized.

## Identity invariant

One account has exactly one active username. The username is the unique,
human-readable public Coin Card identity key. Account IDs and Coin Card IDs are
opaque, immutable machine identifiers and are never usernames, aliases, or
alternate public routes.

For Antoine Dennison:

```text
username input       AntoineDennison
normalized username  antoinedennison
canonical URL        https://antoinedennison.coincard.click/
equivalent URL       https://coincard.click/antoinedennison
```

The equivalent URL redirects to the canonical URL. Both forms exact-match the
same normalized username. `coincard.click/antoine` means only "look up the exact
username `antoine`" and must not redirect to or resolve `antoinedennison`.

Search may return `antoinedennison` for partial input such as `antoine`, but the
user must deliberately select that result. Search output never substitutes for
exact route resolution and never supplies payment authority.

## Identifier model

```text
Account     account_id = acct_<ULID>
  owns
Coin Card   card_id    = cc_<ULID>
  publishes
Username    username   = antoinedennison
```

The artifact V1 field named `handle` carries the normalized username. That wire
name does not create a separate handle identity or an alias mechanism.

## Legacy debt

The existing signed lifecycle bundle and static registry contain the historical
prototype card ID `antoine`. It is not Antoine Dennison's username, is not an
alias for `antoinedennison`, and must not be accepted by Public Resolution v1 as
a current Coin Card ID. Public Resolution v1 accepts only `cc_<ULID>` card IDs.

Those signed assets remain evidence of the historical lifecycle. They must not
be silently edited, re-signed, or republished merely to make the new public
resolver pass.

## Governed migration sequence

1. Inventory and preserve the current signed bundle, keys, manifests, hashes,
   registry facts, and publication evidence.
2. Allocate production opaque `acct_<ULID>` and `cc_<ULID>` identifiers. Test
   fixture identifiers are not production allocations.
3. Build the new authenticated exact-match registry record binding
   `antoinedennison` to the allocated opaque Coin Card ID under
   `COIN_CARD_PUBLIC_USERNAME_REGISTRY_CONTRACT_V1.md`, publish its immutable
   snapshot through `COIN_CARD_PUBLIC_REGISTRY_SOURCE_CONTRACT_V1.md`, and
   atomically advance a signed Current Head under
   `COIN_CARD_PUBLIC_USERNAME_REGISTRY_CURRENT_HEAD_CONTRACT_V1.md` only after
   the exact snapshot URL passes its HTTP and authentication checks.
4. Under an explicitly authorized signing operation, issue a new signed
   lifecycle identity for the opaque Coin Card ID and a dedicated migration
   record linking it to the historical `antoine` identity. Do not pretend that
   changing the primary card ID is an ordinary same-card successor event.
5. Terminalize the legacy public route as governed by the lifecycle rules. It
   may remain available as non-executable historical evidence, but never as a
   username alias or payment route.
6. Switch the username registry's current head only after the opaque lifecycle
   chain authenticates, selects, resolves, and promotes successfully. The
   registry change and lifecycle publication must fail closed if they cannot be
   made consistently.
7. Freeze the protected asset set, then update and sign its integrity manifest
   through the existing release procedure.
8. Verify both exact URL forms, terminal states, stale-authority rejection, and
   execution-closed entry before production publication.

Rollback must restore the prior registry head without making the historical
`antoine` identity executable or treating it as a public alias.

## Explicit non-actions in this slice

- No production account or card ID is allocated.
- No signed lifecycle bundle or protected static registry is modified.
- No integrity manifest is regenerated or signed.
- No production publication, DNS change, deployment, or wallet execution is
  authorized.
