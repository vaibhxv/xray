/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@xray/shared'],
  images: {
    // Thumbnails are served by the API; allow remote patterns loosely since
    // the dashboard is a local-only tool on the Pi's LAN.
    remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
