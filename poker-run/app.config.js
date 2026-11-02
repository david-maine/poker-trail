const { expo: baseConfig } = require("./app.json");

module.exports = () => ({
  ...baseConfig,
  ios: {
    ...baseConfig.ios,
    config: {
      ...baseConfig.ios?.config,
      googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
    },
  },
  android: {
    ...baseConfig.android,
    config: {
      ...baseConfig.android?.config,
      googleMaps: {
        ...baseConfig.android?.config?.googleMaps,
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
});
