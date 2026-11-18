---
name: verify
description: Use before saying a change a visitor can see works, and before committing it or opening its PR. Runs the site and uses the change the way a visitor would, then reports evidence.
---

# Verify

Tests prove the rules; this proves the page. Use the change like a visitor would, on the real site served locally, and come back with evidence.

## Steps

1. **Pick what to check.** From `git diff --stat main...HEAD` and the working tree, list each page and control the change touches. `feature-map.md` (beside this file) says where each feature lives and what it should do. Done when every changed file that a visitor sees is matched to a page and a control.
2. **Serve the site.** Start the `site` server from `.claude/launch.json` in the browser pane (`preview_start {name: "site"}`), or with the Playwright browser tools if those are what's loaded. It's a plain file server: anything that needs the Worker (signing in, Save, Delete, a recipe website's address) doesn't work here. For those, the browser tests are the check, since they fake the Worker: run the spec that covers it (`npx playwright test editor --project=chrome`), and say the live check was skipped and why.
3. **Use the change.** For each control on the list, do what a visitor would, by its visible label, with a tap and then with the keyboard (Tab to it, Enter or Space). Watch for what the feature map expects. Reload the page and go Back once: what the URL and saved progress keep should survive both.
4. **Look for breakage.** After using each page: the console has no errors (`read_console_messages`, errors only), and no request failed (`read_network_requests`: no 404s for the site's own files).
5. **Phone and dark.** Repeat the main path at phone width (`resize_window` preset `mobile`) and in dark mode (`colorScheme: "dark"`). Done when nothing overflows sideways, nothing is cut off or hidden behind another element, and the text is readable in both modes. Reset to preset `desktop` when finished.
6. **Evidence.** Screenshot the changed state, at phone width when the change is visual.

## When something's wrong

Fix it, then run the step that failed again. When the same failure survives three fixes, stop and tell the user what fails, what you tried, and what you think is wrong.

## Report

- What you did, page by page, and what you saw.
- The screenshot(s).
- What you didn't check and why (the Worker, Safari, real-phone touch, sound). When a change could behave differently in Safari (focus, scrolling, dates, timers, audio, layout), say `npm run test:all` is the check for that.
