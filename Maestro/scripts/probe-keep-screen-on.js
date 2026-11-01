// Whether the app's window keeps the screen on (Android's
// FLAG_KEEP_SCREEN_ON, set by expo-keep-awake), in output.keepsScreenOn. With
// WATCH (seconds), true if it was on at any point while watched, so "off" is
// only reported once it stayed off that long: turning it on is asynchronous.
const watch = typeof WATCH === "undefined" ? "0" : WATCH;
const body = json(
  http.get("http://127.0.0.1:54399/keep-screen-on?watch=" + watch).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.keepsScreenOn = body.on;
