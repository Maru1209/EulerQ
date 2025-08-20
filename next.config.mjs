// next.config.mjs  (UTF-8)
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/solve', destination: 'http://127.0.0.1:8080/api/solve' },
    ];
  },
};

export default nextConfig;
