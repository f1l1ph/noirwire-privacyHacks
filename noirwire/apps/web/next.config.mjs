/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use empty turbopack config to silence warning (we use --webpack flag)
  turbopack: {},

  webpack: (config, { isServer, webpack }) => {
    // Client-side: provide polyfills for Node.js modules
    if (!isServer) {
      // Explicit aliases for Node.js modules
      config.resolve.alias = {
        ...config.resolve.alias,
        buffer: "buffer",
        crypto: "crypto-browserify",
        stream: "stream-browserify",
        path: "path-browserify",
      };

      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: "crypto-browserify",
        path: "path-browserify",
        stream: "stream-browserify",
        buffer: "buffer",
      };

      // Provide buffer and process globally for packages that need it
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
      );

      // Add polyfills as entry point
      const originalEntry = config.entry;
      config.entry = async () => {
        const entries = await originalEntry();
        if (entries["main.js"] && !entries["main.js"].includes("./polyfills.js")) {
          entries["main.js"].unshift("./polyfills.js");
        }
        if (entries["main-app"] && !entries["main-app"].includes("./polyfills.js")) {
          entries["main-app"].unshift("./polyfills.js");
        }
        return entries;
      };
    }

    // Don't externalize these - we need webpack to handle them
    if (!isServer) {
      const externals = config.externals || [];
      config.externals = [...externals].filter((ext) => {
        if (typeof ext === "object") {
          return !ext["utf-8-validate"] && !ext["bufferutil"];
        }
        return true;
      });
    }

    // Ensure proper module resolution for ESM/CJS interop
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };

    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // WASM file handling
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    // Ensure WASM files are copied to public output
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
      generator: {
        filename: "static/wasm/[name].[hash][ext]",
      },
    });

    return config;
  },

  // Allow importing from outside the app directory
  transpilePackages: [
    "@noirwire/sdk",
    "@noirwire/db",
    "@noirwire/types",
    "@noirwire/utils",
    "@solana/web3.js",
    "@solana/buffer-layout",
    "@solana/buffer-layout-utils",
    "@coral-xyz/anchor",
  ],
};

export default nextConfig;
