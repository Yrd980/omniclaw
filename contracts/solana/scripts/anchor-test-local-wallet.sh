#!/usr/bin/env bash
set -euo pipefail

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

wallet="$tmpdir/id.json"
solana-keygen new --no-bip39-passphrase --silent --outfile "$wallet" >/dev/null

anchor test --provider.wallet "$wallet" "$@"
