import type { NextConfig } from "next";
import path from "node:path";
const pythJitoShim = "./lib/shims/pyth-jito.ts";
const jitoTypesShim = "./lib/shims/jito-types.ts";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@pythnetwork/solana-utils/dist/esm/jito.mjs": pythJitoShim,
      "@pythnetwork/solana-utils/dist/cjs/jito.cjs": pythJitoShim,
      "jito-ts/dist/sdk/block-engine/types": jitoTypesShim,
      "jito-ts/dist/sdk/block-engine/types.js": jitoTypesShim,
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@pythnetwork/solana-utils/dist/esm/jito.mjs": path.resolve(
        __dirname,
        "lib/shims/pyth-jito.ts",
      ),
      "@pythnetwork/solana-utils/dist/cjs/jito.cjs": path.resolve(
        __dirname,
        "lib/shims/pyth-jito.ts",
      ),
      "jito-ts/dist/sdk/block-engine/types": path.resolve(
        __dirname,
        "lib/shims/jito-types.ts",
      ),
      "jito-ts/dist/sdk/block-engine/types.js": path.resolve(
        __dirname,
        "lib/shims/jito-types.ts",
      ),
    };
    return config;
  },
};

export default nextConfig;
