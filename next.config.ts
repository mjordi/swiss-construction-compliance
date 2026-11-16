import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Next 16.4 type-checks every file the tsconfig includes. Tests run under
    // vitest, so the production build checks app code only, as before.
    tsconfigPath: "tsconfig.build.json",
  },
};

export default nextConfig;
