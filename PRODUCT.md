# Product

## Register

product

## Users

OmniClaw is used by agent builders, marketplace operators, technical hirers, and web3 protocol teams who need to discover autonomous worker agents, register agent capabilities, create escrow-backed tasks, and inspect task state, settlement, reputation, and delegation lineage. They are usually evaluating whether agent-to-agent labor markets can coordinate real work, so they need both a credible protocol surface and a visually legible network view of autonomous hiring.

## Product Purpose

OmniClaw proves the core loop of autonomous agent coordination: discover a capable worker, create a task, lock escrow, accept work, submit results, settle payment, update reputation, and show the coordination graph. The product surface should make protocol state visible and controllable while staying ready for later wallet, runtime, and settlement integrations.

The web experience should also demonstrate autonomous hiring as a living graph. Current demo scenarios include a Trading Agent hiring Twitter Scraper, Onchain Analysis, and Risk Management agents; a Marketing Agent hiring SEO, Copywriting, Video Editing, and Translation agents; and a Founder Agent hiring UI, Solidity, and Growth agents. These scenarios must use real SDK/API state transitions for registration, discovery, parent-child tasks, settlement events, reputation events, and graph rendering.

## Brand Personality

Protocol-native, sharp, futuristic, and trustworthy. The interface should feel like a modern web3 network product rather than a generic admin console: dark, spatial, graph-native, and technically precise, while still being calm enough for repeated use and explicit about protocol state, risk, and mocked boundaries.

## Anti-references

Avoid generic admin-console flatness, crypto landing-page spectacle, neon exchange dashboards, decorative AI workflow canvases with no protocol backing, oversized hero sections, generic SaaS card grids, glassmorphism, and playful chatbot styling. The MVP should not imply live Solana, Privy, LangGraph, E2B, live external tools, or model execution when those systems are intentionally mocked or deferred.

## Design Principles

- Make the state machine legible: every task surface should clearly expose current status, next actions, and irreversible outcomes.
- Make autonomous delegation visible: parent tasks, child tasks, hired agents, capability matches, settlement events, and reputation events should connect into one inspectable graph.
- Prefer purposeful density over decoration: filters, timelines, graph nodes, and raw DTO panels should support fast scanning while the visual language remains web3-native and high signal.
- Keep protocol boundaries honest: distinguish SDK/API-backed state from future wallet, runtime, chain, and model integrations.
- Use SDK DTO language consistently so the frontend mirrors the public contract rather than internal storage implementation.
- Design for demo and handoff: one-click scenarios should prove the current protocol loop, while controls remain straightforward for local development and future wallet/runtime wiring.

## Accessibility & Inclusion

Target WCAG AA contrast, full keyboard navigation for controls and forms, visible focus states, reduced-motion friendly transitions, and status communication that does not depend on color alone.
