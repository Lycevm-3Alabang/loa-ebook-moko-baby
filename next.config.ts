import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  // The export's Excel template is read from the filesystem by the export
  // route, so it has to be traced into the serverless bundle. Without this it
  // is absent in production and the export 500s there while working locally.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/templates/**/*"],
  },
  async redirects() {
    return [
      {
        source: "/admin/consultations/reports/evaluation-results",
        destination: "/admin/evaluations/results",
        permanent: true,
      },
      {
        source: "/dean/reports/evaluation-results",
        destination: "/dean/evaluations/results",
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
