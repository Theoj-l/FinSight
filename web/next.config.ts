import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Minimal self-contained server bundle for the production Docker image
  // (web/Dockerfile copies .next/standalone and runs `node server.js`).
  output: "standalone",

  // This repo has a lockfile at the root (for dev tooling) and one here.
  // Pin the workspace root to web/ so Turbopack — and output-file tracing
  // for the standalone bundle — don't walk up to the repo root.
  turbopack: {
    root: path.join(__dirname),
  },

  // The SQL parser used by the text-to-SQL chat loads a WebAssembly file at
  // runtime. Keep it out of the bundle so the standalone image traces and ships it.
  serverExternalPackages: ["libpg-query"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
