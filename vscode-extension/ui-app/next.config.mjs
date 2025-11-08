/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Disable image optimization for VSCode extension
  images: {
    unoptimized: true,
  },
}

export default nextConfig



