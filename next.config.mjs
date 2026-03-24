/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mongoose'],
  },
  webpack: (config, { isServer }) => {
    // Fix intermittent Windows builds where server runtime tries to `require("./<id>.js")`
    // but Next emits the chunk under `.next/server/chunks/<id>.js`.
    if (isServer && config?.output?.chunkFilename && typeof config.output.chunkFilename === "string") {
      const chunkFilename = config.output.chunkFilename
      if (!chunkFilename.includes("/") && !chunkFilename.includes("\\")) {
        config.output.chunkFilename = `chunks/${chunkFilename}`
      }
    }
    return config
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
  // Suppress hydration warnings in development
  reactStrictMode: false,
  // Disable caching for API routes on Vercel
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noopener, noreferrer',
          },
        ],
      },
    ]
  },
}

export default nextConfig
