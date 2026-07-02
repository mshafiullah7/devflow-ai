const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'DevFlow AI',
    executableName: 'devflow-ai',
    icon: './assets/icon',
    ignore: [
      /^\/agent\//,         // Python agent source — never ship readable code
      /^\/\.claude\//,      // worktrees, memory, session data
      /^\/\.git\//,         // git history
      /^\/out\//,           // previous build output
      /^\/\.env/,           // any .env files
    ],
  },
  rebuildConfig: {
    onlyModules: ['better-sqlite3'],
  },
  makers: [
    // NSIS installer disabled during testing phase
    // {
    //   name: './makers/maker-nsis',
    //   platforms: ['win32'],
    //   config: {
    //     appId: 'com.devflow.ai',
    //     oneClick: false,
    //     allowElevation: true,
    //     allowToChangeInstallationDirectory: true,
    //     createDesktopShortcut: true,
    //     createStartMenuShortcut: true,
    //     shortcutName: 'DevFlow AI SDLC',
    //     deleteAppDataOnUninstall: false,
    //     menuCategory: 'DevFlow',
    //     publish: {
    //       provider: 'github',
    //       owner: 'YOUR_GITHUB_USERNAME',
    //       repo: 'devflow-ai-sdlc',
    //       private: false,
    //     },
    //   },
    // },
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
