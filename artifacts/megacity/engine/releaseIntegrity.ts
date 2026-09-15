import { Platform } from "react-native";

export type ReleaseIntegrityStatus = {
  mode: "packaged" | "unpackaged";
  trusted: boolean;
  reason: string;
  version: string | null;
  build: string | null;
  manifestVersion: number | null;
};

const DEVELOPMENT_STATUS: ReleaseIntegrityStatus = {
  mode: "unpackaged",
  trusted: true,
  reason: "development-exempt",
  version: null,
  build: null,
  manifestVersion: null,
};

let currentStatus: ReleaseIntegrityStatus = { ...DEVELOPMENT_STATUS };
const listeners = new Set<(status: ReleaseIntegrityStatus) => void>();
let initialization: Promise<ReleaseIntegrityStatus> | null = null;

function getDesktopBridge(): any | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return (window as any).desktop ?? null;
}

function sanitizeStatus(value: unknown): ReleaseIntegrityStatus {
  if (!value || typeof value !== "object") return { ...DEVELOPMENT_STATUS };
  const raw = value as Record<string, unknown>;
  return {
    mode: raw.mode === "packaged" ? "packaged" : "unpackaged",
    trusted: raw.trusted === true,
    reason: typeof raw.reason === "string" ? raw.reason : "verification-error",
    version: typeof raw.version === "string" ? raw.version : null,
    build: typeof raw.build === "string" ? raw.build : null,
    manifestVersion: Number.isInteger(raw.manifestVersion)
      ? raw.manifestVersion as number
      : null,
  };
}

export function getReleaseIntegrityStatus(): ReleaseIntegrityStatus {
  return { ...currentStatus };
}

export function isReleaseIntegrityTrusted(): boolean {
  return currentStatus.trusted;
}

export function subscribeReleaseIntegrity(
  listener: (status: ReleaseIntegrityStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Primarily useful for focused runtime tests. Production callers should use
// initReleaseIntegrity so only the narrow desktop bridge can set this state.
export function setReleaseIntegrityStatus(value: unknown): ReleaseIntegrityStatus {
  currentStatus = sanitizeStatus(value);
  listeners.forEach((listener) => listener(getReleaseIntegrityStatus()));
  return getReleaseIntegrityStatus();
}

export async function initReleaseIntegrity(): Promise<ReleaseIntegrityStatus> {
  if (initialization) return initialization;
  initialization = (async () => {
    const bridge = getDesktopBridge();
    if (!bridge || typeof bridge.getReleaseIntegrityStatus !== "function") {
      return getReleaseIntegrityStatus();
    }
    try {
      const result = await Promise.race([
        Promise.resolve(bridge.getReleaseIntegrityStatus()),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (result !== null) setReleaseIntegrityStatus(result);
    } catch {
      // A missing or unavailable bridge is normal in Expo web and native.
      // It must not disable offline play in those environments.
    }
    return getReleaseIntegrityStatus();
  })();
  try {
    return await initialization;
  } finally {
    initialization = null;
  }
}