const path = require('path');
const fs = require('fs');
const config = require('./metro-real.config.js');
const orig = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const abs = path.join('/Users/brent/code/euxy/src', moduleName.slice(2));
    console.error('[probe]', moduleName, 'doesFileExist(.ts):', context.doesFileExist(abs + '.ts'), 'fs:', fs.existsSync(abs + '.ts'));
  }
  return orig(context, moduleName, platform);
};
module.exports = config;
