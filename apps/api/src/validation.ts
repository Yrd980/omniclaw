import { ApiError, invariant } from "./errors";
import type { AgentStatus, JsonObject, TaskStatus } from "./types";

export type JsonSchemaValidationError = {
  path: string;
  message: string;
};

export const readJsonObjectBody = async (request: Request): Promise<JsonObject> => {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body must be valid JSON");
  }
  invariant(isJsonObject(parsed), 400, "INVALID_BODY", "request body must be a JSON object");
  return parsed;
};

export const requireString = (body: JsonObject, field: string): string => {
  const value = body[field];
  invariant(typeof value === "string" && value.length > 0, 400, "INVALID_BODY", `${field} is required`);
  return value;
};

export const optionalString = (body: JsonObject, field: string): string | undefined => {
  const value = body[field];
  invariant(value === undefined || typeof value === "string", 400, "INVALID_BODY", `${field} must be a string`);
  return value;
};

export const optionalNullableString = (body: JsonObject, field: string): string | null | undefined => {
  const value = body[field];
  invariant(value === undefined || value === null || typeof value === "string", 400, "INVALID_BODY", `${field} must be a string or null`);
  return value;
};

export const optionalNumber = (body: JsonObject, field: string): number | undefined => {
  const value = body[field];
  invariant(value === undefined || (typeof value === "number" && Number.isFinite(value)), 400, "INVALID_BODY", `${field} must be a number`);
  return value;
};

export const optionalStringArray = (body: JsonObject, field: string): string[] | undefined => {
  const value = body[field];
  invariant(value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string")), 400, "INVALID_BODY", `${field} must be a string array`);
  return value;
};

export const optionalJsonObject = (body: JsonObject, field: string): JsonObject | undefined => {
  const value = body[field];
  invariant(value === undefined || isJsonObject(value), 400, "INVALID_BODY", `${field} must be a JSON object`);
  return value;
};

export const optionalArray = (body: JsonObject, field: string): unknown[] | undefined => {
  const value = body[field];
  invariant(value === undefined || Array.isArray(value), 400, "INVALID_BODY", `${field} must be an array`);
  return value;
};

export const requireLamports = (body: JsonObject, field: string): string => {
  const value = requireString(body, field);
  invariant(/^\d+$/.test(value), 400, "INVALID_BODY", `${field} must be a non-negative integer string`);
  return value;
};

export const requireFutureTimestamp = (body: JsonObject, field: string): string => {
  const value = requireString(body, field);
  invariant(Number.isFinite(new Date(value).getTime()), 400, "INVALID_BODY", `${field} must be an ISO timestamp`);
  return value;
};

export const optionalAgentStatus = (body: JsonObject, field: string): AgentStatus | undefined => {
  const value = body[field];
  invariant(value === undefined || value === "active" || value === "paused" || value === "suspended", 400, "INVALID_BODY", `${field} is invalid`);
  return value as AgentStatus | undefined;
};

export const requiredResolution = (body: JsonObject): "completed" | "failed" | "disputed" => {
  const value = body.resolution;
  invariant(value === "completed" || value === "failed" || value === "disputed", 400, "INVALID_BODY", "resolution must be completed, failed, or disputed");
  return value;
};

export const queryString = (params: URLSearchParams, field: string): string | undefined => {
  const value = params.get(field) ?? undefined;
  invariant(value === undefined || value.length > 0, 400, "INVALID_QUERY", `${field} cannot be empty`);
  return value;
};

export const queryNumber = (params: URLSearchParams, field: string): string | undefined => {
  const value = queryString(params, field);
  invariant(value === undefined || Number.isFinite(Number(value)), 400, "INVALID_QUERY", `${field} must be a number`);
  return value;
};

export const queryLamports = (params: URLSearchParams, field: string): string | undefined => {
  const value = queryString(params, field);
  invariant(value === undefined || /^\d+$/.test(value), 400, "INVALID_QUERY", `${field} must be a non-negative integer string`);
  return value;
};

export const queryTimestamp = (params: URLSearchParams, field: string): string | undefined => {
  const value = queryString(params, field);
  invariant(value === undefined || Number.isFinite(new Date(value).getTime()), 400, "INVALID_QUERY", `${field} must be an ISO timestamp`);
  return value;
};

export const queryTaskStatus = (params: URLSearchParams): TaskStatus | undefined => {
  const value = queryString(params, "status");
  invariant(
    value === undefined ||
      ["created", "escrow_locked", "accepted", "in_progress", "submitted", "completed", "failed", "expired", "disputed", "cancelled"].includes(value),
    400,
    "INVALID_QUERY",
    "status is invalid",
  );
  return value as TaskStatus | undefined;
};

export const validatePayloadAgainstSchema = (payload: JsonObject, schema: JsonObject, label: string) => {
  const errors: JsonSchemaValidationError[] = [];
  validateObject(payload, schema, label, errors);
  if (errors.length > 0) {
    throw new ApiError(400, "SCHEMA_VALIDATION_FAILED", `${label} does not match schema`, errors);
  }
};

export const isJsonSchemaObject = (value: unknown): value is JsonObject => {
  if (!isJsonObject(value)) {
    return false;
  }
  const schemaType = value.type;
  return schemaType === undefined || typeof schemaType === "string" || (Array.isArray(schemaType) && schemaType.every((item: unknown) => typeof item === "string"));
};

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateObject = (payload: JsonObject, schema: JsonObject, path: string, errors: JsonSchemaValidationError[]) => {
  const schemaType = schema.type;
  if (schemaType !== undefined && !schemaAllows(schemaType, "object")) {
    errors.push({ path, message: "schema type must allow object payloads" });
    return;
  }

  const required = schema.required;
  if (required !== undefined && (!Array.isArray(required) || !required.every((field) => typeof field === "string"))) {
    errors.push({ path: `${path}.required`, message: "required must be a string array" });
    return;
  }
  for (const field of (required as string[] | undefined) ?? []) {
    if (!Object.hasOwn(payload, field)) {
      errors.push({ path: `${path}.${field}`, message: "is required" });
    }
  }

  const properties = schema.properties;
  if (properties !== undefined && !isJsonObject(properties)) {
    errors.push({ path: `${path}.properties`, message: "properties must be an object" });
    return;
  }

  for (const [field, propertySchema] of Object.entries((properties as Record<string, unknown> | undefined) ?? {})) {
    if (!Object.hasOwn(payload, field) || !isJsonObject(propertySchema)) {
      continue;
    }
    validateValue(payload[field], propertySchema, `${path}.${field}`, errors);
  }
};

const validateValue = (value: unknown, schema: JsonObject, path: string, errors: JsonSchemaValidationError[]) => {
  const expectedType = schema.type;
  if (expectedType !== undefined && !schemaAllows(expectedType, jsonType(value))) {
    errors.push({ path, message: `must be ${Array.isArray(expectedType) ? expectedType.join(" or ") : expectedType}` });
    return;
  }
  if (isJsonObject(value) && isJsonObject(schema.properties)) {
    validateObject(value, schema, path, errors);
  }
};

const schemaAllows = (schemaType: unknown, actualType: string): boolean => {
  const allowed = Array.isArray(schemaType) ? schemaType : [schemaType];
  return allowed.includes(actualType);
};

const jsonType = (value: unknown): string => {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
};
