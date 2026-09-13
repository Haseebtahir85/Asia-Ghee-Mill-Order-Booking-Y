/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit reads its built-in Helvetica font data from .afm files inside
  // its own node_modules folder at runtime (not bundled as JS), and
  // Vercel's automatic file-tracing can miss non-code assets like this —
  // force them to be included in these two routes' serverless functions.
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/orders/export": ["./node_modules/pdfkit/js/data/**/*"],
      "/api/admin/orders/export-new": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

module.exports = nextConfig;
