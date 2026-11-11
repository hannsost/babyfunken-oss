const { getDefaultConfig } = require('expo/metro-config');

// Expo's default config already resolves workspace packages in a
// monorepo, so @babyfunken/shared needs no extra wiring here.
const config = getDefaultConfig(__dirname);

// Bundled lullabies.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'mp3'])];

module.exports = config;
