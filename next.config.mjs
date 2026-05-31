/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` produces a small Cloud Run-friendly server bundle in
  // .next/standalone which the Dockerfile runner stage copies out.
  output: "standalone",
};

export default nextConfig;
