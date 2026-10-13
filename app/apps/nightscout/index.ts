import { type AppDefinition } from "../app-definition";
import { createNightscoutAppWindow, startNightscoutTrayIcon, NIGHTSCOUT_SURFACE_ID, NIGHTSCOUT_WINDOW_ID } from "./nightscout-app";
import { startMissedBolusMonitor } from "./missed-bolus-monitor";

const nightscoutApp: AppDefinition = {
  appId: "nightscout",
  title: "Nightscout",
  icon: "nightscout",
  boot: (ctx) => {
    startNightscoutTrayIcon();
    startMissedBolusMonitor(ctx);
  },
  launch: (ctx) => ctx.launchInProcessApp(NIGHTSCOUT_WINDOW_ID, NIGHTSCOUT_SURFACE_ID, createNightscoutAppWindow),
};

export default nightscoutApp;
