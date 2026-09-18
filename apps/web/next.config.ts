import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@oa/domain", "@oa/schemas", "@oa/skill-runtime"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  poweredByHeader: false
};

export default config;
