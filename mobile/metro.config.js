const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Support .cjs and .mjs files (needed for Three.js)
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'cjs', 'mjs'];

// Tell Metro to prefer 'main' over 'module' in package.json (fixes Three.js)
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// 1. Force Metro to resolve specific modules to the mobile node_modules only
config.resolver.extraNodeModules = {
    'react': path.resolve(__dirname, 'node_modules/react'),
    'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    '@react-navigation/native': path.resolve(__dirname, 'node_modules/@react-navigation/native'),
    'three': path.resolve(__dirname, 'node_modules/three'),
    'buffer': path.resolve(__dirname, 'node_modules/buffer'),
    'events': path.resolve(__dirname, 'node_modules/events'),
};

// 2. Blacklist the root node_modules to prevent LinkingContext/Context conflicts
// This is critical when mobile is nested inside a backend project with its own node_modules
config.resolver.blockList = [
    new RegExp(path.resolve(__dirname, '..', 'node_modules').replace(/[\\/]/g, '[\\\\/]'))
];

// 3. Ensure Metro watches only the mobile directory
config.watchFolders = [__dirname];

module.exports = config;
