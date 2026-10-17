import { type AppDefinition } from "../app-definition";
import { createTranscribeAppWindow, TRANSCRIBE_SURFACE_ID, TRANSCRIBE_WINDOW_ID } from "./transcribe-app";

const transcribeApp: AppDefinition = {
  appId: "transcribe",
  title: "Transcribe",
  icon: "mic",
  launch: (ctx) =>
    ctx.launchInProcessApp(TRANSCRIBE_WINDOW_ID, TRANSCRIBE_SURFACE_ID, (options) =>
      createTranscribeAppWindow({
        ...options,
        startContinuousVoiceCapture: (capture) => void options.actions.startContinuousVoiceCapture(capture),
        stopContinuousVoiceCapture: () => void options.actions.stopContinuousVoiceCapture(),
      }),
    ),
};

export default transcribeApp;
