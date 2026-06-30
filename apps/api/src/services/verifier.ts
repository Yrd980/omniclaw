import type { DataStore } from "../store";
import type { DeliveryManifest } from "../types";
import { updateManifestVerifierStatus } from "./manifest";

export type VerifyResult = {
  status: DeliveryManifest["verifierStatus"];
  exitCode: number | null;
  stdout: string | null;
  durationMs: number;
};

export const runVerifier = async (
  store: DataStore,
  manifest: DeliveryManifest,
): Promise<VerifyResult> => {
  if (!manifest.verifierCommand) {
    return {
      status: "passed",
      exitCode: 0,
      stdout: "no verifier configured; auto-passed",
      durationMs: 0,
    };
  }

  const startTime = Date.now();

  try {
    const result = await executeWithTimeout(
      manifest.verifierCommand,
      manifest.verificationTimeoutMs,
    );

    const durationMs = Date.now() - startTime;

    const passed = result.exitCode === 0 &&
      (!manifest.verifierExpectedOutput ||
       result.stdout.includes(manifest.verifierExpectedOutput));

    const status = passed ? "passed" : "failed";

    await updateManifestVerifierStatus(
      store,
      manifest,
      status,
      result.exitCode,
      result.stdout,
    );

    return {
      status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.message.includes("timeout");

    const status = isTimeout ? "timeout" : "error";

    await updateManifestVerifierStatus(
      store,
      manifest,
      status,
      null,
      error instanceof Error ? error.message : String(error),
    );

    return {
      status,
      exitCode: null,
      stdout: error instanceof Error ? error.message : String(error),
      durationMs,
    };
  }
};

const executeWithTimeout = async (
  command: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string }> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`verifier timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const child = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    child.exited.then(async (exitCode) => {
      clearTimeout(timeout);
      let stdout = "";
      if (child.stdout) {
        const reader = child.stdout.getReader();
        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            chunks.push(result.value);
          }
        }
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        stdout = new TextDecoder().decode(combined);
      }
      resolve({ exitCode, stdout });
    }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
};
