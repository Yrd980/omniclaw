# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a single-context domain-doc layout:

- `CONTEXT.md` at the repo root for domain language.
- `docs/adr/` for architectural decision records.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` ADRs that touch the area you're about to work in.
- Product and architecture docs under `docs/`, especially `docs/spec.md`, `docs/tech-stack.md`, `docs/environment.md`, `docs/api-usage.md`, `docs/sdk-usage.md`, and `docs/productization-plan.md`.

If any of these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront. Producer skills such as `/grill-with-docs` create missing domain docs lazily when terms or decisions get resolved.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `CONTEXT.md`.

If the concept you need isn't in the glossary yet, either reconsider whether the project already uses different language, or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> Contradicts ADR-0007 - but worth reopening because...

