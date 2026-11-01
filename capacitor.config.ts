
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sanjays.maxledger.full",
  appName: "MaxLedger",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    Preferences: {
      group: "MaxLedger"
    }
  }
};

export default config;
