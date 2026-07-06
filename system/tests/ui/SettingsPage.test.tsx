import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import SettingsPage from "../../src/app/(app)/dashboard/settings/page";

describe("Settings Page", () => {
  it("renders the settings UI and loading state initially", () => {
    const html = ReactDOMServer.renderToString(React.createElement(SettingsPage));
    expect(html).toContain("Loading settings...");
  });
});
