/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@kalshi-tracker/db", "@kalshi-tracker/kalshi-client"],
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
