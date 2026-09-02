import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This repo has a lockfile at the root (for dev tooling) and one here.
  // Pin the workspace root to web/ so Turbopack doesn't guess.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
