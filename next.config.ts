// next.config.js
module.exports = {
  webpack: (config, { isServer, webpack }) => {
    // Client-side only configuration
    if (!isServer) {
      // Exclude problematic modules from client bundles
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^fs$/,
          contextRegExp: /@cornerstonejs\/codec-openjph/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^path$/,
          contextRegExp: /@cornerstonejs\/codec-openjph/,
        })
      );
      
      // Provide browser-compatible alternatives
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: require.resolve("path-browserify"),
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
      };
    }
    return config;
  },
};