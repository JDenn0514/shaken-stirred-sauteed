# Ideas for later

Projects that came up while designing something else. None of them is planned yet. When one starts, it gets its own spec in `docs/specs/`.

## Settings page

2026-11-03 · from the meal planner design (`docs/specs/meal-planner-design.md`)

A page that holds your cooking preferences so you don't pick them every time. The first one is the meal planner's **"Prep everything first" or "Fastest"**. Until this page exists, the meal page remembers that choice itself.

Other settings that could move here:

- **Theme.** It's saved today as `theme`, by `assets/theme.js`.
- **Your pace,** if the planner learns how fast you cook.
- **Cooking setup:** number of burners, ovens and so on.
- **Units:** grams or cups first.

**Saved where:** the theme is kept on the device in `localStorage`, and settings could start there too. **Multiple users** is what would change that. If the site ever plans for more than one person (each with their own pace, preferences and saved meals), settings need to belong to a person, not a device. That means some kind of account or profile, and somewhere to store it beyond the browser. That decision belongs to the multi-user project. A settings page on the device first doesn't block it, as long as the settings are kept in one place that could later be saved per person.
