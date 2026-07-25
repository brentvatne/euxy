// Standalone nested app: shared pure modules are COPIED into web/shared/ by
// scripts/sync-shared.mjs (expo export doesn't crawl out-of-root
// watchFolders, and a self-contained web/ survives EAS deploy workers).
// Bare imports resolve from web/node_modules exclusively so the two
// dependency trees can't cross-contaminate. See docs/design/web-plan.md
// "Repo mechanics".
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
// `@/` means web/shared/ — same layout as the app's src/, so the shared
// modules' own `@/...` imports resolve unchanged.
const SHARED = path.resolve(__dirname, 'shared');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(context, path.join(SHARED, moduleName.slice(2)), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
