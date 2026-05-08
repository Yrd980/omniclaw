import type { OmniClawApiErrorEnvelope } from "./types";

export class OmniClawApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
    public readonly path: string,
  ) {
    super(message);
    this.name = "OmniClawApiError";
  }

  static fromEnvelope(status: number, envelope: OmniClawApiErrorEnvelope): OmniClawApiError {
    return new OmniClawApiError(
      status,
      envelope.error.code,
      envelope.error.message,
      envelope.error.details,
      envelope.error.path,
    );
  }
}
