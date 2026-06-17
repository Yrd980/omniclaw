import { createHash } from "node:crypto";
import { ApiError, invariant } from "./errors";
import type { ArtifactReference, ArtifactValidationStatus } from "./task-contracts";
import { normalizeArtifactReferences } from "./task-contracts";
import type { JsonObject, Task } from "./types";

export const DELIVERY_MANIFEST_VERSION = "omniclaw.delivery.v1" as const;

export type DeliveryManifestInput = {
  manifest_version: typeof DELIVERY_MANIFEST_VERSION;
  task_id: string;
  source_agent_id: string;
  task_pack?: string;
  public_safe: boolean;
  inputs: DeliveryManifestInputReference[];
  outputs: DeliveryManifestOutputReference[];
  verifier?: DeliveryManifestVerifier | null;
  acceptance: {
    criteria: string[];
    review_window_hours?: number;
  };
};

export type DeliveryManifestInputReference = {
  name: string;
  kind: string;
  hash: string;
};

export type DeliveryManifestOutputReference = {
  name: string;
  kind: string;
  uri: string;
  hash: string;
  safety_label: string;
};

export type DeliveryManifestVerifier = {
  kind: string;
  entrypoint: string;
  smoke_command?: string;
  expected_output: string;
};

export type VerifierStatus = "not_configured" | "pending";
export type PublicSafetyStatus = "public_safe" | "unsafe" | "private" | "inconsistent";

export type DeliveryManifestValidation = {
  manifest: DeliveryManifestInput;
  manifestHash: string;
  verifierStatus: VerifierStatus;
  publicSafetyStatus: PublicSafetyStatus;
  artifactReferences: ArtifactReference[];
};

export const validateDeliveryManifest = (
  task: Task,
  manifestValue: unknown,
  artifacts: unknown[],
): DeliveryManifestValidation => {
  invariant(isJsonObject(manifestValue), 400, "INVALID_BODY", "delivery_manifest must be a JSON object");
  const manifest = parseManifest(manifestValue);
  invariant(manifest.manifest_version === DELIVERY_MANIFEST_VERSION, 400, "INVALID_BODY", "delivery_manifest.manifest_version must be omniclaw.delivery.v1");
  invariant(manifest.task_id === task.id, 400, "INVALID_BODY", "delivery_manifest.task_id must match task_id");
  invariant(manifest.source_agent_id === task.workerAgentId, 400, "INVALID_BODY", "delivery_manifest.source_agent_id must match worker agent");

  const artifactReferences = normalizeArtifactReferences(artifacts);
  validateManifestOutputs(manifest.outputs, artifactReferences);
  const publicSafetyStatus = manifest.public_safe ? validatePublicSafeOutputs(manifest.outputs, artifactReferences) : "private";

  return {
    manifest,
    manifestHash: stableHash(manifest),
    verifierStatus: manifest.verifier ? "pending" : "not_configured",
    publicSafetyStatus,
    artifactReferences,
  };
};

export const stableHash = (value: unknown): string =>
  `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;

const parseManifest = (value: JsonObject): DeliveryManifestInput => {
  const inputs = value.inputs;
  const outputs = value.outputs;
  const acceptance = value.acceptance;
  invariant(Array.isArray(inputs), 400, "INVALID_BODY", "delivery_manifest.inputs must be an array");
  invariant(Array.isArray(outputs) && outputs.length > 0, 400, "INVALID_BODY", "delivery_manifest.outputs must be a non-empty array");
  invariant(isJsonObject(acceptance), 400, "INVALID_BODY", "delivery_manifest.acceptance must be a JSON object");
  const criteria = acceptance.criteria;
  invariant(Array.isArray(criteria) && criteria.every(isNonEmptyString), 400, "INVALID_BODY", "delivery_manifest.acceptance.criteria must be a string array");
  invariant(
    acceptance.review_window_hours === undefined || (typeof acceptance.review_window_hours === "number" && Number.isFinite(acceptance.review_window_hours)),
    400,
    "INVALID_BODY",
    "delivery_manifest.acceptance.review_window_hours must be a number",
  );
  const verifier = value.verifier === undefined || value.verifier === null ? null : parseVerifier(value.verifier);
  return {
    manifest_version: requireLiteralVersion(value.manifest_version),
    task_id: requireString(value.task_id, "delivery_manifest.task_id"),
    source_agent_id: requireString(value.source_agent_id, "delivery_manifest.source_agent_id"),
    ...(typeof value.task_pack === "string" && value.task_pack.length > 0 ? { task_pack: value.task_pack } : {}),
    public_safe: requireBoolean(value.public_safe, "delivery_manifest.public_safe"),
    inputs: inputs.map((input, index) => parseInputReference(input, index)),
    outputs: outputs.map((output, index) => parseOutputReference(output, index)),
    verifier,
    acceptance: {
      criteria,
      ...(typeof acceptance.review_window_hours === "number" ? { review_window_hours: acceptance.review_window_hours } : {}),
    },
  };
};

const parseInputReference = (value: unknown, index: number): DeliveryManifestInputReference => {
  invariant(isJsonObject(value), 400, "INVALID_BODY", `delivery_manifest.inputs.${index} must be a JSON object`);
  const hash = requireHash(value.hash, `delivery_manifest.inputs.${index}.hash`);
  return {
    name: requireString(value.name, `delivery_manifest.inputs.${index}.name`),
    kind: requireString(value.kind, `delivery_manifest.inputs.${index}.kind`),
    hash,
  };
};

const parseOutputReference = (value: unknown, index: number): DeliveryManifestOutputReference => {
  invariant(isJsonObject(value), 400, "INVALID_BODY", `delivery_manifest.outputs.${index} must be a JSON object`);
  return {
    name: requireString(value.name, `delivery_manifest.outputs.${index}.name`),
    kind: requireString(value.kind, `delivery_manifest.outputs.${index}.kind`),
    uri: requireString(value.uri, `delivery_manifest.outputs.${index}.uri`),
    hash: requireHash(value.hash, `delivery_manifest.outputs.${index}.hash`),
    safety_label: requireString(value.safety_label, `delivery_manifest.outputs.${index}.safety_label`),
  };
};

const parseVerifier = (value: unknown): DeliveryManifestVerifier => {
  invariant(isJsonObject(value), 400, "INVALID_BODY", "delivery_manifest.verifier must be a JSON object");
  return {
    kind: requireString(value.kind, "delivery_manifest.verifier.kind"),
    entrypoint: requireString(value.entrypoint, "delivery_manifest.verifier.entrypoint"),
    ...(typeof value.smoke_command === "string" && value.smoke_command.length > 0 ? { smoke_command: value.smoke_command } : {}),
    expected_output: requireString(value.expected_output, "delivery_manifest.verifier.expected_output"),
  };
};

const validateManifestOutputs = (outputs: DeliveryManifestOutputReference[], artifacts: ArtifactReference[]) => {
  for (const output of outputs) {
    const artifact = artifacts.find((candidate) => candidate.uri === output.uri);
    invariant(artifact, 400, "INVALID_BODY", `delivery_manifest output ${output.uri} must reference a submitted artifact`);
    invariant(artifact.hash === output.hash, 400, "INVALID_BODY", `delivery_manifest output ${output.uri} hash must match artifact hash`);
    invariant(artifact.safety_label === output.safety_label, 400, "INVALID_BODY", `delivery_manifest output ${output.uri} safety_label must match artifact safety_label`);
  }
};

const validatePublicSafeOutputs = (
  outputs: DeliveryManifestOutputReference[],
  artifacts: ArtifactReference[],
): PublicSafetyStatus => {
  const statuses = outputs.map((output) => artifacts.find((artifact) => artifact.uri === output.uri)?.validation_status ?? "missing_hash");
  if (statuses.every((status) => status === "validated")) {
    return "public_safe";
  }
  const firstBlockingStatus = statuses.find((status) => status === "unsafe" || status === "private_runtime");
  if (firstBlockingStatus) {
    throw publicSafetyError(firstBlockingStatus);
  }
  throw publicSafetyError("missing_hash");
};

const publicSafetyError = (status: ArtifactValidationStatus): ApiError => {
  const message = status === "unsafe"
    ? "public-safe delivery_manifest cannot reference unsafe artifacts"
    : status === "private_runtime"
      ? "public-safe delivery_manifest cannot reference private runtime artifacts"
      : "public-safe delivery_manifest outputs require validated artifact hashes";
  return new ApiError(400, "INVALID_BODY", message);
};

const requireLiteralVersion = (value: unknown): typeof DELIVERY_MANIFEST_VERSION => {
  invariant(value === DELIVERY_MANIFEST_VERSION, 400, "INVALID_BODY", "delivery_manifest.manifest_version must be omniclaw.delivery.v1");
  return value;
};

const requireString = (value: unknown, path: string): string => {
  invariant(isNonEmptyString(value), 400, "INVALID_BODY", `${path} is required`);
  return value;
};

const requireBoolean = (value: unknown, path: string): boolean => {
  invariant(typeof value === "boolean", 400, "INVALID_BODY", `${path} must be boolean`);
  return value;
};

const requireHash = (value: unknown, path: string): string => {
  const hash = requireString(value, path);
  invariant(/^sha256:[a-fA-F0-9]{64}$/.test(hash), 400, "INVALID_BODY", `${path} must be a sha256 digest`);
  return hash;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
