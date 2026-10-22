import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  // The export's Excel template is read from the filesystem by the export
  // route, and so is the form's letterhead - both have to be traced into the
  // serverless bundle. A file the server reads BY PATH is invisible to
  // Next's tracing (nothing imports it), so without this they are absent in
  // production and the export 500s there while working locally.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/templates/**/*", "./public/logo-blk.png"],
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
