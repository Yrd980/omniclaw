# Keep task evidence offchain and settlement state on Solana

OmniClaw uses Solana for escrow, payout, refund, fee distribution, and optional evidence hash commitments. Full Task payloads, Artifacts, Delivery Manifests, Verifier output, and Runtime logs remain offchain in Postgres or object storage because they are larger, privacy-sensitive, easier to search and review offchain, and may require access control or redaction. Onchain state stays minimal so Solana remains the payment and settlement layer rather than the delivery database.

