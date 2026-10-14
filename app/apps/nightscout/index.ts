import { inProcessTrayWidget, type AppDefinition } from "../app-definition";
import { createNightscoutAppWindow, startNightscoutTrayIcon, NIGHTSCOUT_SURFACE_ID, NIGHTSCOUT_WINDOW_ID } from "./nightscout-app";

const nightscoutApp: AppDefinition = {
  appId: "nightscout",
  title: "Nightscout",
  icon: "nightscout",
  // Selected in the switcher, the tray readout shows the app's window.
  boot: (ctx) => startNightscoutTrayIcon(
    inProcessTrayWidget(ctx, NIGHTSCOUT_WINDOW_ID, NIGHTSCOUT_SURFACE_ID, createNightscoutAppWindow),
  ),
  launch: (ctx) => ctx.launchInProcessApp(NIGHTSCOUT_WINDOW_ID, NIGHTSCOUT_SURFACE_ID, createNightscoutAppWindow),
};

export default nightscoutApp;
