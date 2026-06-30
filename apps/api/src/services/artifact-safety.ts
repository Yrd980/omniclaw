import type { DataStore } from "../store";
import type { ArtifactCheck, DeliveryManifest } from "../types";

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})/gi,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*["']?([^\s"']{10,})/gi,
  /(?:private[_-]?key)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})/gi,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  /(?:bearer|authorization)\s*[:=]\s*["']?(?:Bearer\s+)?([a-zA-Z0-9_\-\.]{20,})/gi,
  /(?:AWS|aws)[_]*(?:ACCESS|SECRET)[_]*(?:KEY|ID)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})/gi,
  /(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /xox[baprs]-[a-zA-Z0-9\-]+/g,
];

const UNSAFE_PATH_PATTERNS = [
  /(?:\/home|\/Users|\/root)\/[^\/\s"']+/gi,
  /(?:C:\\Users|C:\\Program Files)\\[^\/\s"']+/gi,
  /(?:~\/|\.\/).+/gi,
  /\/etc\/(?:passwd|shadow|hosts)/gi,
  /\/var\/log\/.+/gi,
];

const UNSAFE_CONTENT_PATTERNS = [
  /(?:eval|exec)\s*\(/gi,
  /(?:__import__|subprocess|os\.system)\s*\(/gi,
  /(?:rm\s+-rf|del\s+\/[sqf])/gi,
  /(?:curl|wget)\s+(?:https?:\/\/)[^\s]+/gi,
];

export const scanArtifactForSecrets = async (
  store: DataStore,
  check: ArtifactCheck,
  content: string,
): Promise<ArtifactCheck> => {
  const findings: Array<{ pattern: string; line: number; match: string }> = [];

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      findings.push({
        pattern: pattern.source,
        line: lineNumber,
        match: match[0].substring(0, 50) + (match[0].length > 50 ? "..." : ""),
      });
    }
  }

  for (const pattern of UNSAFE_PATH_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      findings.push({
        pattern: pattern.source,
        line: lineNumber,
        match: match[0].substring(0, 50) + (match[0].length > 50 ? "..." : ""),
      });
    }
  }

  for (const pattern of UNSAFE_CONTENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      findings.push({
        pattern: pattern.source,
        line: lineNumber,
        match: match[0].substring(0, 50) + (match[0].length > 50 ? "..." : ""),
      });
    }
  }

  const updated: ArtifactCheck = {
    ...check,
    secretScanStatus: findings.length > 0 ? "findings" : "clean",
    secretScanFindings: findings,
    safetyStatus: findings.length > 0 ? "unsafe" : "validated",
    displayable: findings.length === 0,
    scannedAt: store.now(),
  };

  await store.updateArtifactCheck(updated);
  return updated;
};

export const validateManifestArtifacts = async (
  store: DataStore,
  manifest: DeliveryManifest,
): Promise<ArtifactCheck[]> => {
  const checks = await store.listArtifactChecksByTaskId(manifest.taskId);
  const updatedChecks: ArtifactCheck[] = [];

  for (const check of checks) {
    if (check.secretScanStatus === "pending") {
      const updated: ArtifactCheck = {
        ...check,
        secretScanStatus: "clean",
        safetyStatus: check.artifactHash ? "validated" : "unvalidated",
        displayable: manifest.publicSafe && Boolean(check.artifactHash),
        scannedAt: store.now(),
      };
      await store.updateArtifactCheck(updated);
      updatedChecks.push(updated);
    } else {
      updatedChecks.push(check);
    }
  }

  return updatedChecks;
};

export const getPublicSafeArtifacts = async (
  store: DataStore,
  taskId: string,
): Promise<ArtifactCheck[]> => {
  const checks = await store.listArtifactChecksByTaskId(taskId);
  return checks.filter((check) => check.displayable && check.safetyStatus === "validated");
};

export const getArtifactSafetySummary = async (
  store: DataStore,
  taskId: string,
) => {
  const checks = await store.listArtifactChecksByTaskId(taskId);
  const total = checks.length;
  const validated = checks.filter((c) => c.safetyStatus === "validated").length;
  const unsafe = checks.filter((c) => c.safetyStatus === "unsafe").length;
  const displayable = checks.filter((c) => c.displayable).length;
  const pending = checks.filter((c) => c.secretScanStatus === "pending").length;

  return {
    total,
    validated,
    unsafe,
    displayable,
    pending,
    validation_rate: total > 0 ? validated / total : 0,
  };
};
