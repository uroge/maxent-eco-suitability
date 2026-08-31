import type { NextConfig } from 'next';
import { clientEnvironment } from './src/env';

const nextConfig: NextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  env: clientEnvironment,
};

export default nextConfig;
