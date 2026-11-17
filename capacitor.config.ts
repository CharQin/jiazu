import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cn.jiazu.family",
  appName: "家族",
  webDir: "dist",
  backgroundColor: "#f7f9f6",
  android: {
    backgroundColor: "#f7f9f6",
    allowMixedContent: false,
    // Standard WebView input keeps Chinese IME edits synchronized with form state.
    captureInput: false,
  },
  plugins: {
    SystemBars: {
      style: "LIGHT",
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};
export default config;
