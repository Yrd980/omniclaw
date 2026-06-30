import { verify } from "@noble/ed25519";
import { ApiError } from "../errors";
import type { Actor } from "../types";

export type SiwsPayload = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string | null;
};

export type SiwsConfig = {
  domain: string;
  nonceExpirySeconds: number;
};

const SIWS_PATTERN = /^(.+?) wants you to sign in with your Solana account:\n(.+?)\n\n(.+?)\n\nURI: (.+?)\nVersion: (.+?)\nChain ID: (.+?)\nNonce: (.+?)\nIssued At: (.+?)(?:\nExpiration Time: (.+?))?$/;

export const parseSiwsMessage = (message: string): SiwsPayload => {
  const match = message.match(SIWS_PATTERN);
  if (!match) {
    throw new ApiError(400, "INVALID_SIWS_MESSAGE", "malformed SIWS message");
  }
  return {
    domain: match[1],
    address: match[2],
    statement: match[3],
    uri: match[4],
    version: match[5],
    chainId: match[6],
    nonce: match[7],
    issuedAt: match[8],
    expirationTime: match[9] ?? null,
  };
};

export const verifySiwsSignature = async (
  message: string,
  signature: string,
  publicKey: string,
): Promise<boolean> => {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");
    const publicKeyBytes = Buffer.from(publicKey, "base64");
    return await verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
};

export const verifySiwsChallenge = async (
  headers: Headers,
  config: SiwsConfig,
): Promise<Actor> => {
  const message = headers.get("x-siws-message");
  const signature = headers.get("x-siws-signature");
  const address = headers.get("x-siws-address");

  if (!message || !signature || !address) {
    throw new ApiError(401, "MISSING_SIWS_HEADERS", "x-siws-message, x-siws-signature, and x-siws-address headers required");
  }

  const payload = parseSiwsMessage(message);

  if (payload.domain !== config.domain) {
    throw new ApiError(401, "INVALID_SIWS_DOMAIN", `expected domain ${config.domain}, got ${payload.domain}`);
  }

  if (payload.address !== address) {
    throw new ApiError(401, "SIWS_ADDRESS_MISMATCH", "signed address does not match header address");
  }

  if (payload.expirationTime) {
    const expiresAt = new Date(payload.expirationTime);
    if (expiresAt < new Date()) {
      throw new ApiError(401, "SIWS_EXPIRED", "signed message has expired");
    }
  }

  const issuedAt = new Date(payload.issuedAt);
  const maxAge = config.nonceExpirySeconds * 1000;
  if (Date.now() - issuedAt.getTime() > maxAge) {
    throw new ApiError(401, "SIWS_NONCE_EXPIRED", "signed message nonce has expired");
  }

  const valid = await verifySiwsSignature(message, signature, address);
  if (!valid) {
    throw new ApiError(401, "INVALID_SIWS_SIGNATURE", "signature verification failed");
  }

  const role = headers.get("x-role");
  return {
    wallet: address,
    agentId: headers.get("x-agent-id") ?? undefined,
    role: role === "admin" ? "admin" : role === "evaluator" ? "evaluator" : undefined,
  };
};
