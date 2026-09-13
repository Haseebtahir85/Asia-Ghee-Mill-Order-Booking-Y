/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit loads its standard fonts via Node's package "imports" field
    // (the #standard-fonts/* subpath syntax) — webpack can't resolve that
    // mapping when it tries to bundle the package for a serverless
    // function, which is what throws "Cannot find module
    // '#standard-fonts/Helvetica'". Marking it external skips webpack
    // entirely for this package: Node's own require() loads it directly
    // from node_modules at runtime, where that resolution works natively.
    serverComponentsExternalPackages: ["pdfkit"],
    // Belt-and-suspenders: also make sure the actual .afm font data files
    // (non-code assets pdfkit reads from disk) are included in these two
    // routes' deployed function bundles.
    outputFileTracingIncludes: {
      "/api/admin/orders/export": ["./node_modules/pdfkit/js/data/**/*"],
      "/api/admin/orders/export-new": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

module.exports = nextConfig;
