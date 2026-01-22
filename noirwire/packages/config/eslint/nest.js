/**
 * @noirwire/config-eslint/nest
 * NestJS specific ESLint configuration
 */
module.exports = {
  extends: ["@noirwire/eslint-config/base"],
  rules: {
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
