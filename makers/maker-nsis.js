'use strict';

const { MakerBase } = require('@electron-forge/maker-base');
const { buildForge } = require('app-builder-lib');

class MakerNSIS extends MakerBase {
  name = 'nsis';
  defaultPlatforms = ['win32'];

  isSupportedOnCurrentPlatform() {
    return process.platform === 'win32';
  }

  async make({ dir, targetArch, forgeConfig }) {
    const { appId, ...nsisConfig } = this.config;
    const executableName = forgeConfig?.packagerConfig?.executableName;
    const result = await buildForge(
      { dir },
      {
        win: [`nsis:${targetArch}`],
        config: {
          appId: appId || 'com.devflow.ai',
          ...(executableName ? { executableName } : {}),
          nsis: nsisConfig,
        },
      }
    );
    return result || [];
  }
}

module.exports = MakerNSIS;
