// The editor's keyboard shortcuts as its help lists them (assets/edit-keys.mjs):
// written the way the keyboard in front of you writes them, ⌘ on a Mac and
// Ctrl elsewhere.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shortcuts, isMac } from "../../assets/edit-keys.mjs";

const said = (mac) => shortcuts(mac).map((s) => `${s.keys.join(" or ")}: ${s.does}`);

describe("shortcuts", () => {
  test("on a Mac, with ⌘", () => assert.deepEqual(said(true), [
    "⌘S: Save",
    "⌘Z: Undo, outside a text box",
    "⇧⌘Z: Redo, outside a text box",
    "Esc: Close the open form without keeping its changes",
    "Enter: Edit the line in the preview that has focus",
    "?: Show these shortcuts",
  ]));
  test("elsewhere, with Ctrl, and Ctrl+Y redoes too", () => assert.deepEqual(said(false), [
    "Ctrl+S: Save",
    "Ctrl+Z: Undo, outside a text box",
    "Ctrl+Shift+Z or Ctrl+Y: Redo, outside a text box",
    "Esc: Close the open form without keeping its changes",
    "Enter: Edit the line in the preview that has focus",
    "?: Show these shortcuts",
  ]));
  test("a Mac, iPhone or iPad is told apart from the rest", () => {
    assert.equal(isMac({ platform: "MacIntel" }), true);
    assert.equal(isMac({ platform: "iPad" }), true);
    assert.equal(isMac({ userAgentData: { platform: "macOS" }, platform: "" }), true);
    assert.equal(isMac({ platform: "Win32" }), false);
    assert.equal(isMac({ platform: "Linux x86_64" }), false);
    assert.equal(isMac({}), false);
  });
});
