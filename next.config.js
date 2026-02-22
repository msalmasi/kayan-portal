/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Kayan Forest logo images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kayanforest.com",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
};

module.exports = nextConfig;
