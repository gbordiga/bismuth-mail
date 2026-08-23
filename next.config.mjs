/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/editor", destination: "/campaigns", permanent: false },
      { source: "/editor/:path*", destination: "/campaigns", permanent: false },
    ]
  },
}

export default nextConfig
