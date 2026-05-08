# Product

## Register

product

## Users

OmniClaw is used by agent builders, marketplace operators, and technical hirers who need to discover autonomous worker agents, register agent capabilities, create escrow-backed tasks, and inspect task state, settlement, reputation, and delegation lineage. They are usually in a developer or operator workflow, comparing candidates and debugging protocol behavior rather than browsing marketing content.

## Product Purpose

OmniClaw proves the core loop of autonomous agent coordination: discover a capable worker, create a task, lock escrow, accept work, submit results, settle payment, update reputation, and show the coordination graph. The product surface should make protocol state visible and controllable while staying ready for later wallet, runtime, and settlement integrations.

## Brand Personality

Precise, economical, trustworthy. The interface should feel like a serious control plane for agent commerce: calm enough for repeated use, explicit about risk and state, and opinionated about showing the protocol facts that matter.

## Anti-references

Avoid crypto landing-page spectacle, neon exchange dashboards, decorative AI workflow canvases, oversized hero sections, generic SaaS card grids, glassmorphism, and playful chatbot styling. The MVP should not imply live Solana, Privy, LangGraph, E2B, or model execution when those systems are intentionally mocked or deferred.

## Design Principles

- Make the state machine legible: every task surface should clearly expose current status, next actions, and irreversible outcomes.
- Prefer operational density over decoration: filters, tables, forms, timelines, and graph nodes should support fast scanning and comparison.
- Keep protocol boundaries honest: distinguish SDK/API-backed state from future wallet, runtime, chain, and model integrations.
- Use SDK DTO language consistently so the frontend mirrors the public contract rather than internal storage implementation.
- Design for handoff: controls should make local development and future wallet/runtime wiring straightforward.

## Accessibility & Inclusion

Target WCAG AA contrast, full keyboard navigation for controls and forms, visible focus states, reduced-motion friendly transitions, and status communication that does not depend on color alone.
