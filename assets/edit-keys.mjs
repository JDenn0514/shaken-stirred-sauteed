// The editor's keyboard shortcuts (edit.html), as its "Keyboard shortcuts"
// help lists them. edit.mjs handles the keys themselves.
//
//   shortcuts(mac)   [{ keys: ["⌘S"], does: "Save" }, …], with ⌘ on a Mac and Ctrl elsewhere
//   isMac(nav)       whether the keyboard has ⌘, from a navigator

export function isMac(nav = {}) {
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || "");
}

export function shortcuts(mac) {
  const mod = (k) => (mac ? `⌘${k}` : `Ctrl+${k}`);
  return [
    { keys: [mod("S")], does: "Save" },
    { keys: [mod("Z")], does: "Undo, outside a text box" },
    { keys: mac ? ["⇧⌘Z"] : ["Ctrl+Shift+Z", "Ctrl+Y"], does: "Redo, outside a text box" },
    { keys: ["Esc"], does: "Close the open form without keeping its changes" },
    { keys: ["Enter"], does: "Edit the line in the preview that has focus" },
    { keys: ["?"], does: "Show these shortcuts" },
  ];
}
