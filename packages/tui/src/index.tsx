import React from "react";
import { render } from "ink";
import { App } from "./App.js";

export async function launchTui() {
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
