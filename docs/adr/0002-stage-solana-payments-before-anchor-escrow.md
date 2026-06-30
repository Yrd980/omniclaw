# Stage Solana payments before Anchor escrow

OmniClaw will integrate Solana payments in stages: first wallet-signed payment or transfer recording, then a testnet settlement adapter, and only later an Anchor escrow program. This keeps early product work focused on proving the Task, Delivery Manifest, verification, review, and payout loop before taking on the additional security, testing, and deployment complexity of a custom onchain escrow program.

