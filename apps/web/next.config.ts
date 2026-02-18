import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@camello/shared', '@camello/ai'],
};

export default nextConfig;
