import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {
    "/api/admin/pdf": ["./fonts/**/*"],
  },
};

export default nextConfig;
