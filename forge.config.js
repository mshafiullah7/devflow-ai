const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'DevFlow AI',
    executableName: 'devflow-ai',
  },
  rebuildConfig: {},
  makers: [
    {
      name: './makers/maker-nsis',
      platforms: ['win32'],
      config: {
        appId: 'com.devflow.ai',  // top-level electron-builder field, not nsis
        oneClick: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'DevFlow AI SDLC',
        deleteAppDataOnUninstall: false,
        menuCategory: 'DevFlow',
        publish: {
          provider: 'github',
          owner: 'YOUR_GITHUB_USERNAME',
          repo: 'devflow-ai-sdlc',
          private: false,
        },
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
