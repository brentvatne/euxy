// Standalone nested app: watch ONLY the main app's src/ for the shared pure
// modules (never the repo root — that would crawl the app's node_modules),
// and resolve every bare import from web/node_modules exclusively so the two
// dependency trees can't cross-contaminate. See docs/design/web-plan.md
// "Repo mechanics".
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.resolve(__dirname, '../src')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
// The `@/` alias means ../src here, exactly as it does in the main app —
// required because the shared modules import each other via `@/`. tsconfig
// paths can't map outside the project root, so resolve the prefix directly.
const SRC = path.resolve(__dirname, '../src');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(context, path.join(SRC, moduleName.slice(2)), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
