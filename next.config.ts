import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  // The form's letterhead is read from the filesystem by the export route, so
  // it has to be traced into the serverless bundle. A file the server reads BY
  // PATH is invisible to Next's tracing (nothing imports it), so without this
  // it is absent in production and the export loses its logo there while
  // working locally.
  //
  // ⭐ The Excel TEMPLATE is no longer traced: the workbook is GENERATED now,
  // so nothing reads data/templates/eval-report.xlsx at runtime — it stays in
  // the repo as the reference the cut script works from.
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/logo-blk.png"],
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
