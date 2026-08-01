# Coin Card Structure Migrations

Structure versions record implementation organization over time. The artifact
contract remains the durable ownership graph; files in this directory explain
how one structure version migrates to the next.

Use migrations to answer questions such as:

- When did an implementation region move?
- When did a selector or module boundary change?
- Which artifact node owned the responsibility before and after the change?
