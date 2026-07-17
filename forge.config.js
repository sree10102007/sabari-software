module.exports = {
  packagerConfig: {
    name: 'Sivakami Traders',
    executableName: 'sivakami-traders',
    icon: 'assets/logo',
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'sivakami_traders',
        setupIcon: 'assets/logo.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
  ],
};
