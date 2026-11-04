// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// プロジェクト直下の web/ は別の Vite プロジェクト（Web 版）なので Metro の対象から外す
const webDir = path.join(__dirname, 'web').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${webDir}[/\\\\].*`)];

module.exports = config;
