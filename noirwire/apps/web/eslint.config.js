import { nextJsConfig } from "@noirwire/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    rules: {
      "react/no-unknown-property": ["error", { ignore: ["jsx", "global"] }],
    },
  },
  {
    files: ["polyfills.js"],
    languageOptions: {
      globals: {
        window: "readonly",
      },
    },
  },
];
