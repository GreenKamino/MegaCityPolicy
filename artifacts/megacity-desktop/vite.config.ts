import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { resolveServerEnv } from "../../tools/vite-config.ts";

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const { port, basePath } = resolveServerEnv(command);
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN ?? "";

  return {
    base: basePath,
    define: {
      "import.meta.env.VITE_EXPO_DOMAIN": JSON.stringify(expoDomain),
    },
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      {
        name: "force-pdf-download",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawPath = (req.url ?? "").split("?")[0];
            if (rawPath.toLowerCase().endsWith(".pdf")) {
              const fileName =
                decodeURIComponent(rawPath.split("/").pop() ?? "") ||
                "download.pdf";
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"`,
              );
            }
            next();
          });
        },
      },
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      ...(expoDomain
        ? {
            proxy: {
              [`${basePath.replace(/\/$/, "")}/__game-status`]: {
                target: `https://${expoDomain}`,
                changeOrigin: true,
                secure: true,
                rewrite: () => "/status",
                timeout: 10000,
                proxyTimeout: 10000,
              },
            },
          }
        : {}),
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
