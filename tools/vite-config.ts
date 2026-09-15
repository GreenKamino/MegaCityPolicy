/**
 * Shared helpers for vite.config.ts files in this monorepo.
 *
 * The Replit dev environment injects PORT and BASE_PATH per artifact;
 * production builds do not. Resolving these inside the function form
 * of `defineConfig` (rather than at module top-level) lets us:
 *
 *   - fail fast and loud during `vite dev` / `vite preview` if a dev
 *     environment is misconfigured (PORT or BASE_PATH missing);
 *   - produce production bundles with `vite build` in environments
 *     that have neither variable set.
 *
 * Usage:
 *
 *   import { defineConfig, type UserConfig } from "vite";
 *   import { resolveServerEnv } from "../../tools/vite-config.ts";
 *
 *   export default defineConfig(
 *     async ({ command }): Promise<UserConfig> => {
 *       const { port, basePath } = resolveServerEnv(command);
 *       return {
 *         base: basePath,
 *         plugins: [...],
 *         server: { port, host: "0.0.0.0", allowedHosts: true },
 *         preview: { port, host: "0.0.0.0", allowedHosts: true },
 *       };
 *     },
 *   );
 */

export interface ResolvedServerEnv {
  /** True when vite is running in serve mode (dev or preview), false during build. */
  isServe: boolean;
  /** Port for the dev/preview server. Undefined during build. */
  port: number | undefined;
  /** Base public path. Defaults to "/" outside serve mode. */
  basePath: string;
}

/**
 * Resolves Replit-injected `PORT` and `BASE_PATH` for a vite artifact.
 *
 * In serve mode both are required and validated; in build mode both
 * are optional and safe defaults are used.
 */
export function resolveServerEnv(
  command: "serve" | "build",
): ResolvedServerEnv {
  const isServe = command === "serve";

  const rawPort = process.env.PORT;
  if (isServe && !rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }
  const port = rawPort ? Number(rawPort) : undefined;
  if (isServe && port !== undefined && (Number.isNaN(port) || port <= 0)) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const envBasePath = process.env.BASE_PATH;
  if (isServe && !envBasePath) {
    throw new Error(
      "BASE_PATH environment variable is required but was not provided.",
    );
  }
  const basePath = envBasePath ?? "/";

  return { isServe, port, basePath };
}
