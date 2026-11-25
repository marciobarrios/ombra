import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      { source: "/docs.md", destination: "/agent-md/docs" },
      { source: "/docs/:item.md", destination: "/agent-md/docs/:item" },
      { source: "/docs/examples/:example.md", destination: "/agent-md/docs/examples/:example" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
