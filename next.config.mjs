/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const API = process.env.NEXT_PUBLIC_API_BASE || 'https://web-production-810f8.up.railway.app';
    return [
      { source: '/api/:path*',      destination: `${API}/api/:path*` },
      { source: '/optimize/:path*', destination: `${API}/optimize/:path*` },
    ];
  },
};
export default nextConfig;
