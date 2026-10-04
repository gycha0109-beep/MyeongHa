const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolveDefault = (name) =>
    defaultResolveRequest
      ? defaultResolveRequest(context, name, platform)
      : context.resolveRequest(context, name, platform);

  try {
    return resolveDefault(moduleName);
  } catch (error) {
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
      return resolveDefault(moduleName.slice(0, -3));
    }
    throw error;
  }
};

module.exports = config;
