import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The engine exports live in public/data and are read at runtime with
  // fs.readFile. On Vercel, public/ assets are NOT in the serverless function
  // filesystem by default, so force-include every engine export in the traced
  // bundle of every page and API route (they're small JSON files). Previously
  // only three routes were listed, so pages like /weekly, /kalman, /earnings
  // and /smart-money could read "not synced" in production.
  outputFileTracingIncludes: {
    // "/*" = one-segment routes (/dashboard…); "/**/*" = deeper ones
    // (/t/[ticker], /api/desk/[ticker]/challenge…).
    "/*": ["./public/data/**/*.json"],
    "/**/*": ["./public/data/**/*.json"],
  },
};

export default nextConfig;
