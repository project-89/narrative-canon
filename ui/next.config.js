/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing from parent src/ directory
  transpilePackages: ['../src'],

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Handle images from the generated-images directory
  images: {
    remotePatterns: [],
    unoptimized: true,
  },

  // Webpack configuration to handle backend imports
  webpack: (config, { isServer }) => {
    // Alias for backend imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@backend': require('path').resolve(__dirname, '../src'),
    };

    return config;
  },
};

module.exports = nextConfig;
