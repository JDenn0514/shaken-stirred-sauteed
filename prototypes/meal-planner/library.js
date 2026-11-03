// ===== The recipes, with the new planning data filled in by hand =====
// Ranges use the middle ("7 to 8 min" plans as 7.5). Hands-on minutes are Claude's estimates.
const S_ = (text, hands, more = {}) => ({ text, hands, wait: 0, ...more });
const LIB = {
  steak: {
    key: "steak", title: "Pan-Seared Ribeye", family: "cooking", serve: "hot", hold: 5,
    steps: [
      S_("Take the steak out of the fridge to sit.", 0.5, { wait: 30 }),
      S_("Heat the oil in the skillet until it just smokes.", 1, { wait: 3, burner: true }),
      S_("Pat the steak dry and season the top.", 1, { burner: true }),
      S_("Lay it in seasoned side down, season the top, sear without moving it.", 0.5, { wait: 4, watch: true, burner: true }),
      S_("Turn it, add the butter, herbs and garlic, and baste to 130°F inside.", 4, { burner: true }),
      S_("Rest the steak.", 0.5, { wait: 7.5 }),
    ],
  },
  asparagus: {
    key: "asparagus", title: "Parmesan Asparagus", family: "cooking", serve: "hot", hold: 5,
    steps: [
      S_("Heat the oven to 200°C / 400°F.", 0.5, { preheat: "200C", auto: true }),
      S_("Lay the asparagus on a sheet; oil, salt and pepper.", 4),
      S_("Lemon juice, lemon rings and butter over the top.", 3),
      S_("Roast until just fork-tender.", 0.5, { wait: 9, oven: "200C" }),
      S_("Switch the oven to broil.", 0.5, { preheat: "broil" }),
      S_("Scatter the parmesan and broil until golden.", 0.5, { wait: 2.5, watch: true, oven: "broil" }),
    ],
  },
  applesauce: {
    key: "applesauce", title: "Applesauce", family: "cooking", serve: "keeps", hold: 0,
    steps: [
      S_("Peel, core and cut the apples small.", 8),
      S_("Put everything in the casserole dish and stir to coat.", 2),
      S_("Microwave on high.", 0.5, { wait: 7.5, micro: true }),
      S_("Stir, then microwave again.", 1, { wait: 7.5, micro: true }),
      S_("Mash to the texture you want.", 2),
    ],
  },
  potatoes: {
    key: "potatoes", title: "Hasselback Potatoes", family: "cooking", serve: "hot", hold: 10,
    subs: [{ label: "Garlic paste", step: 4, options: [["have", "I have some"], ["garlic", "Make it"]] }],
    steps: [
      S_("Heat the oven to 200°C / 400°F and line a tray.", 1, { preheat: "200C" }),
      S_("Scrub and dry the potatoes.", 3),
      S_("Slice each potato thinly, stopping short of the base.", 10),
      S_("Set them on the tray, cut side up.", 1),
      S_("Mix the oil, butter, garlic paste, salt and pepper; hold back half.", 3),
      S_("Brush the potatoes and bake.", 3, { wait: 40, oven: "200C" }),
      S_("Baste with the rest and bake until crisp.", 2, { wait: 17.5, oven: "200C" }),
      S_("Scatter with parsley.", 1),
    ],
  },
  garlic: {
    key: "garlic", title: "Garlic Paste", family: "cooking", serve: "keeps", hold: 0,
    steps: [
      S_("Trim and chop the garlic cloves.", 4),
      S_("Add the salt and muddle to a paste.", 5),
      S_("Stir in the olive oil.", 1),
    ],
  },
  pavlova: {
    key: "pavlova", title: "Pavlova", family: "baking", serve: "soon", hold: 15,
    subs: [
      { label: "Lemon curd", step: 8, options: [["curd", "Make it"], ["have", "I have some"]] },
      { label: "Whipped cream", step: 8, options: [["bcream", "Blueberry, make it"], ["cream", "Plain, make it"], ["have", "I have some"]] },
    ],
    steps: [
      S_("Heat the oven to 350°F.", 0.5, { preheat: "350F" }),
      S_("Whip the egg whites to soft peaks.", 0.5, { wait: 5, watch: true }),
      S_("Add the sugar in two parts, then beat on high.", 1, { wait: 2, watch: true }),
      S_("Beat in the vanilla.", 1),
      S_("Fold in the cream of tartar and cornstarch.", 1),
      S_("Spread into a circle with tall edges.", 4),
      S_("Into the oven, and turn it down to 200°F straight away.", 0.5, { wait: 90, oven: "200F", ovenChange: true }),
      S_("Turn the oven off; let it cool inside with the door shut.", 0.5, { wait: 120, oven: "off", ovenChange: true, holds: true }),
      S_("Pile on the cream, curd and berries.", 4),
    ],
  },
  curd: {
    key: "curd", title: "Lemon Curd", family: "baking", serve: "keeps", hold: 0,
    steps: [
      S_("Rub the zest into the sugar, then leave it.", 1, { wait: 10 }),
      S_("Fill a big bowl with ice water.", 2),
      S_("Bring the juice to a simmer; whisk the eggs, yolks and salt into the zest-sugar.", 3, { burner: true }),
      S_("Temper: drizzle the hot juice into the eggs, whisking.", 2, { burner: true }),
      S_("Back into the pan; cook, whisking often.", 6, { burner: true }),
      S_("Off the heat, whisk in the butter.", 1),
      S_("Strain into a bowl.", 3),
      S_("Cover the surface; ice bath, then the fridge.", 1, { wait: 90 }),
    ],
  },
  cream: {
    key: "cream", title: "Whipped Cream", family: "baking", serve: "soon", hold: 20,
    steps: [
      S_("Whip the cream, sugar and vanilla to medium peaks.", 0.5, { wait: 3.5, watch: true }),
      S_("Cover and chill until needed.", 0.5),
    ],
  },
  bcream: {
    key: "bcream", title: "Blueberry Whipped Cream", family: "baking", serve: "soon", hold: 20,
    subs: [{ label: "Blueberry syrup", step: 1, options: [["syrup", "Make it"], ["have", "I have some"]] }],
    steps: [
      S_("Whip the cream to soft peaks.", 0.5, { wait: 3, watch: true }),
      S_("Turn the speed down and add the blueberry syrup.", 1),
      S_("Add the confectioners' sugar; whip to medium-firm peaks.", 0.5, { wait: 2, watch: true }),
    ],
  },
  syrup: {
    key: "syrup", title: "Blueberry Syrup", family: "cocktails", serve: "keeps", hold: 0,
    steps: [
      S_("Combine the blueberries, sugar and water; bring to a simmer.", 1, { wait: 4, burner: true }),
      S_("Simmer, mashing the berries, until the sugar dissolves.", 5, { burner: true }),
      S_("Strain, pressing the solids.", 3),
      S_("Cool, then chill.", 1, { wait: 60 }),
    ],
  },
};
