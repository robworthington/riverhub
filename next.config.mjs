/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Server Actions are enabled by default in Next 15.
  },
  // Spills IA restructure (REGULATORY-RESTRUCTURE-PLAN.md): the old flat routes now live under the
  // four-section IA. Keep permanent redirects so external links and the sitemap don't break.
  async redirects() {
    return [
      { source: "/explore/spills/league", destination: "/explore/spills/why", permanent: true },
      { source: "/explore/spills/works", destination: "/explore/spills/why/capacity", permanent: true },
      { source: "/explore/spills/action", destination: "/explore/spills/gaps", permanent: true },
      { source: "/explore/spills/about", destination: "/explore/spills/method", permanent: true },
    ];
  },
};

export default nextConfig;
