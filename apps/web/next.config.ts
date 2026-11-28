import type { NextConfig } from 'next';
import { clientEnvironment } from './src/env';

const nextConfig: NextConfig = {
  output: process.env.VERCEL === '1' ? undefined : 'standalone',
  productionBrowserSourceMaps: false,
  env: clientEnvironment,
};

export default nextConfig;
