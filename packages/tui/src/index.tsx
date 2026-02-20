import React from "react";
import { render } from "ink";
import { App, ADDICT_BANNER } from "./App.js";

export async function launchTui() {
  // Print the banner once as static output before Ink starts managing the
  // terminal. This keeps it out of Ink's managed area so it is never redrawn.
  process.stdout.write(ADDICT_BANNER.join("\n") + "\n\n");
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
