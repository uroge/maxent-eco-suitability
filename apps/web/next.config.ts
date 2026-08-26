import type { NextConfig } from 'next';
import { clientEnvironment } from './src/env';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: clientEnvironment,
};

export default nextConfig;
