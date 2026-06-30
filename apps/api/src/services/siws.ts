import { invariant } from "../errors";
import type { DataStore } from "../store";

const NONCE_EXPIRY_MS = 5 * 60 * 1000;

type NonceStore = Map<string, { nonce: string; expiresAt: number }>;

const nonceStore: NonceStore = new Map();

export const generateNonce = (address: string): { nonce: string; message: string; expiresAt: string } => {
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const expiresAt = Date.now() + NONCE_EXPIRY_MS;

  nonceStore.set(address.toLowerCase(), { nonce, expiresAt });

  const message = createSiwsMessage({
    domain: "omniclaw.local",
    address,
    statement: "Sign in to OmniClaw",
    uri: "http://localhost:3000",
    chainId: "mainnet",
    nonce,
  });

  return {
    nonce,
    message,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

export const verifySiws = async (
  store: DataStore,
  input: { message: string; signature: string; address: string },
): Promise<{ valid: boolean; address: string; agent_id: string | null; role: "admin" | "evaluator" | null }> => {
  const { message, signature, address } = input;

  invariant(address && message && signature, 400, "INVALID_BODY", "message, signature, and address are required");

  const storedNonce = nonceStore.get(address.toLowerCase());
  if (!storedNonce) {
    return { valid: false, address, agent_id: null, role: null };
  }

  if (Date.now() > storedNonce.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return { valid: false, address, agent_id: null, role: null };
  }

  const parsedMessage = parseSiwsMessage(message);
  if (!parsedMessage) {
    return { valid: false, address, agent_id: null, role: null };
  }

  if (parsedMessage.nonce !== storedNonce.nonce) {
    nonceStore.delete(address.toLowerCase());
    return { valid: false, address, agent_id: null, role: null };
  }

  if (parsedMessage.address.toLowerCase() !== address.toLowerCase()) {
    nonceStore.delete(address.toLowerCase());
    return { valid: false, address, agent_id: null, role: null };
  }

  nonceStore.delete(address.toLowerCase());

  const valid = await verifyEd25519Signature(message, signature, address);

  if (!valid) {
    return { valid: false, address, agent_id: null, role: null };
  }

  const agents = await store.listAgents();
  const agent = agents.find((a) => a.publisherWallet.toLowerCase() === address.toLowerCase());

  return {
    valid: true,
    address,
    agent_id: agent?.id ?? null,
    role: agent ? null : "admin",
  };
};

const createSiwsMessage = (params: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: string;
  nonce: string;
}): string => {
  return `${params.domain} wants you to sign in with your Solana account:
${params.address}

${params.statement}

URI: ${params.uri}
Chain ID: ${params.chainId}
Nonce: ${params.nonce}
Issued At: ${new Date().toISOString()}`;
};

const parseSiwsMessage = (message: string): { address: string; nonce: string } | null => {
  const lines = message.split("\n");
  if (lines.length < 5) return null;

  const address = lines[1]?.trim();
  const nonceLine = lines.find((line) => line.startsWith("Nonce:"));
  const nonce = nonceLine?.split(":")[1]?.trim();

  if (!address || !nonce) return null;

  return { address, nonce };
};

const verifyEd25519Signature = async (
  message: string,
  signature: string,
  address: string,
): Promise<boolean> => {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");

    if (signatureBytes.length !== 64) {
      return false;
    }

    const publicKeyBytes = Buffer.from(address, "base64");

    if (publicKeyBytes.length !== 32) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
