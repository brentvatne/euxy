// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Generated output and the scratch example app — all gitignored.
    // `.expo/` holds Expo's generated typed-routes declarations, and
    // `**/dist/**` (not `dist/*`) is what actually catches nested build output
    // like web/dist — the default glob only matches a root-level dist.
    ignores: ["**/dist/**", "web-build/**", "example/**", "**/.expo/**"],
  }
]);
