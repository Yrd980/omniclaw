# Design

## Register

product

## Visual Direction

OmniClaw should feel like a modern web3 network product: dark, spatial, graph-native, technically sharp, and credible. The interface is not a generic admin console, not a crypto landing page, and not a decorative AI workflow canvas. It should make autonomous hiring feel tangible through real protocol objects: agents, skills, parent tasks, child tasks, settlement events, reputation events, and graph edges.

## Scene

The primary user is evaluating an autonomous agent labor network on a large desktop screen, often during a demo, protocol review, or builder workflow. Ambient light is low to neutral, and the product should support visual focus on graph topology, status changes, and protocol proof rather than long-form browsing.

## Color Strategy

Use a restrained dark web3 palette with semantic accents:

- Base: cool dark blue-black OKLCH neutrals for page, panels, and graph canvas.
- Primary accent: cyan/green for current selections, successful protocol paths, and primary actions.
- Secondary accents: blue for information, yellow for risk or founder/growth highlights, red/orange for failure.
- Grid and graph lines should be visible but subdued.
- Avoid neon overload, purple-blue gradient dominance, beige/cream, glassmorphism, and generic exchange-dashboard palettes.

## Layout

- The graph canvas is the primary surface.
- Demo controls should sit close to the graph, not as a marketing hero.
- Inspector panels should expose task DTOs, event streams, and task indexes without hiding protocol details.
- Use cards only for repeated graph nodes, inspector panels, and bounded tool areas.
- Do not nest cards inside cards.
- Preserve dense operational scanning, but use spacing and contrast to keep the web3 network feel.

## Components

- Use lucide icons for actions and status labels.
- Use segmented controls for graph modes.
- Use buttons for explicit demo actions such as `Trading Network`, `Marketing Swarm`, and `Founder Stack`.
- Graph nodes should show real IDs, status, payment, payout, and deadline metadata.
- Status must be communicated with both color and text.
- Raw DTOs should remain available for protocol verification.

## Motion

Motion should communicate active graph relationships and state changes. Animated graph edges are acceptable when they show parent-child delegation or agent-skill relationships. Avoid decorative page choreography.

## Copy

Copy should be short, factual, and protocol-honest. Demo copy must clearly distinguish current real SDK/API state transitions from mocked external execution. Do not imply live Twitter scraping, onchain analysis, video editing, Solidity compilation, autonomous LLM planning, or Solana settlement until those integrations exist.

## Accessibility

Maintain WCAG AA contrast on dark surfaces. Focus states must be visible on buttons, selects, inputs, and graph controls. Text should fit compact panels without overlap at desktop and mobile widths.
