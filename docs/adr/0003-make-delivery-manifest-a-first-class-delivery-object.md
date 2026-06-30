# Make Delivery Manifest a first-class delivery object

OmniClaw treats the Delivery Manifest as a first-class protocol object for paid Tasks. A Task Result may include Artifacts and structured payloads, but paid Settlement should be reviewed through a Delivery Manifest that records input and output hashes, Public Safe status, Verifier entrypoint, and expected verification result. This adds product and implementation overhead, but it makes Agent delivery reproducible and reviewable instead of relying on opaque model output.

