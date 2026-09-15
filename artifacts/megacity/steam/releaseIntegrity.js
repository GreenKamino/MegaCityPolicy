"use strict";

// This is a tamper-evidence check, not DRM. The manifest is shipped beside the
// files it describes, so a determined attacker can replace both; it is useful
// for catching casual edits, incomplete installs, and stale release payloads.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MANIFEST_VERSION = 1;
const SHA256_RE = /^[a-f0-9]{64}$/;

function status(mode, trusted, reason, manifest) {
  return {
    mode,
    trusted,
    reason,
    version: typeof manifest?.appVersion === "string" ? manifest.appVersion : null,
    build: typeof manifest?.buildId === "string"
      ? manifest.buildId
      : typeof manifest?.generatedAt === "string" ? manifest.generatedAt : null,
    manifestVersion: Number.isInteger(manifest?.manifestVersion)
      ? manifest.manifestVersion
      : null,
  };
}

function invalidManifest(message) {
  const error = new Error(message);
  error.code = "INVALID_RELEASE_MANIFEST";
  throw error;
}

function validateRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    invalidManifest("manifest file path must be a non-empty string");
  }
  // Manifest paths are POSIX paths even when generated on Windows. Reject
  // both slash styles so a Windows path cannot become traversal on extraction.
  if (value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) {
    invalidManifest(`manifest file path is absolute or not portable: ${value}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    invalidManifest(`manifest file path contains traversal: ${value}`);
  }
  if (path.posix.normalize(value) !== value) {
    invalidManifest(`manifest file path is not normalized: ${value}`);
  }
  return value;
}

function parseManifest(raw) {
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    invalidManifest("release manifest is not valid JSON");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    invalidManifest("release manifest must be an object");
  }
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    invalidManifest(`unsupported release manifest version: ${String(manifest.manifestVersion)}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    invalidManifest("release manifest files must be a non-empty array");
  }
  const seen = new Set();
  let previous = null;
  const files = manifest.files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      invalidManifest("release manifest file entry must be an object");
    }
    const file = validateRelativePath(entry.path);
    if (seen.has(file)) invalidManifest(`duplicate release manifest path: ${file}`);
    if (previous !== null && file <= previous) {
      invalidManifest("release manifest paths must be strictly sorted");
    }
    previous = file;
    seen.add(file);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      invalidManifest(`invalid byte size for release manifest path: ${file}`);
    }
    if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) {
      invalidManifest(`invalid SHA-256 for release manifest path: ${file}`);
    }
    return { path: file, size: entry.size, sha256: entry.sha256 };
  });
  return { ...manifest, files };
}

function verifyReleaseIntegrity(rootDir, options = {}) {
  const packaged = options.isPackaged === true;
  if (!packaged) {
    return status("unpackaged", true, "development-exempt", null);
  }
  const manifestPath = options.manifestPath || path.join(rootDir, "release-manifest.json");
  let manifest;
  try {
    manifest = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return status(
      "packaged",
      false,
      error?.code === "INVALID_RELEASE_MANIFEST" ? "malformed-manifest" : "manifest-missing",
      null,
    );
  }
  for (const entry of manifest.files) {
    const filePath = path.resolve(rootDir, ...entry.path.split("/"));
    const root = path.resolve(rootDir);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return status("packaged", false, "path-traversal", manifest);
    }
    let bytes;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (error) {
      return status("packaged", false, error?.code === "ENOENT" ? "missing-file" : "unreadable-file", manifest);
    }
    if (bytes.length !== entry.size) {
      return status("packaged", false, "changed-file", manifest);
    }
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) {
      return status("packaged", false, "changed-file", manifest);
    }
  }
  return status("packaged", true, "verified", manifest);
}

module.exports = {
  MANIFEST_VERSION,
  parseManifest,
  verifyReleaseIntegrity,
};