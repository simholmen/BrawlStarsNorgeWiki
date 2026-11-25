import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Jekyll URLs all end in a slash (/personer/zimma/); keep every existing URL working.
  trailingSlash: true,
};

export default nextConfig;
