# Recipes

A recipe book, drawn the way the games here are: the picture is the
interface (no HTML or CSS on its page). Say what is in the kitchen, and
what wants using up, and the recipes line up by what can be cooked. Each
recipe says what a serving gives, worked out from its ingredients, and
what was eaten is added up by the day.

```sh
make recipes && .build/recipes [BOOK [KITCHEN]]
make web                             # the page is .build/web/recipes/
```

`BOOK` is `programs/recipes/recipes.txt` if none; `KITCHEN` (what there is
to eat where, and what was eaten) is `.build/recipes-kitchen.txt`. Off a page
the window is phone shaped; `L8_W`, `L8_H` and `L8_UI` (window pixels to
the book's, in hundredths) change it. On the page, `?fresh` starts with an
empty kitchen.

## Using it

Three tabs along the bottom; a finger slides between them too.

- **On hand**: where you are, and what there is to eat there. The places
  come first (a new book has Home, and Office with breakfast and lunch;
  **+ Place** adds one). **Set up** shows how the place shown goes: one
  list, or (**By meal**, **By day**) one for each meal, or each day of the
  week, or each meal of each day, as an office's cafeteria might; the
  meals it **Has**; and **Remove**. Its meals and days are picked under
  it, the clock's to begin with (today has a dot; at an hour whose meal
  the place has not, its meal before).
  Splitting a place's list starts each new one as the old one was. Under
  them, every food in the book, by kind: a tap says it is there (green);
  a second, that it should be used up soon (amber); a third, that it is
  not. An empty list offers to start from another of the place's (the
  same meal on the nearest day before). The field finds a food by name.
  At the foot it says how the kitchen is kept (see below).
- **Recipes**: ranked by the list for where you are (the green pill says
  which; a tap goes to it), and, where the place's lists go by meal, of
  that meal to begin with. In three parts: ready to cook (everything is there), a thing
  or two short, and needs a shop. In each, recipes that use up the most
  come first, then those missing least. Each card says what is missing and
  what it uses up. The pills pick a meal; the field finds recipes by name
  or by a food in them. The cards glide to their new places as the kitchen
  changes.
- **Today**: what was eaten today, added up, and the days before.

A recipe's page slides in over them (slide it back to the right to go
back). Its ingredients say what the kitchen has (a tap changes it); its
servings scale the amounts; its nutrition card gives a serving's energy,
protein, carbs, fat and fiber, and its vitamins and minerals against the
daily values; then the method. **I ate a serving** adds it to today.

Keys: Tab or `1` `2` `3` the tabs (On hand, Recipes, Today); typing writes in the tab's field;
Escape clears it, or goes back; Backspace or Left goes back from a recipe.

## Keeping it

The kitchen (places, their lists, where you are, what was eaten) is one
text file, written after each change. On the page it is kept in the
browser, and, with a personal link (`…/recipes/#me=SECRET`), in a
Cloudflare D1 database by the worker in `web/recipe-book/`: the same on
every device with the link. The page saves a second or so after a change
(and when it is hidden), and fetches the kitchen again when it is looked
at after a while, so a change made on the phone shows on the laptop. If
both changed while apart, the later wins; the worker keeps the text from
before each save made from an older one (and one an hour anyway, the last
500), and `admin.sh past LINK` / `restore LINK REV` get them back.

```sh
cd web/recipe-book
./admin.sh new NAME          # a kitchen, and its link
./admin.sh past LINK         # its texts before
```

The kitchen's file, a line to a thing:

```
place m|d|md|-[/blds] NAME...  what the place's lists go by (meal, day), and its
                             meals if not all (b breakfast, l lunch...); in order from 0
here PLACE
have PLACE MEAL DAY FOOD     MEAL as lunch, DAY as wed, - for any
use PLACE MEAL DAY FOOD      (to use up soon)
ate DAY RECIPE SERVINGS      DAY as days from 1970
```

## The book

If the web app stops, its recovery message offers a download of the kitchen
file last written in that page before restarting. That copy can include work
which has not reached browser storage or the worker; it cannot include edits
the app had not yet written. Keep the download for recovery help. Restart
reopens the saved kitchen and removes `?fresh`, so a fresh session is not
silently started again. A fresh kitchen needs a recovery download to keep it.

`recipes.txt` holds the foods and the recipes; its head says the format.
It starts empty: foods are added as they come up, and recipes as they
are asked for. `test-book.txt` (the first book, 63 foods and 20 recipes)
is what the tests read.
A food has what is in 100 g of it (USDA FoodData Central figures, rounded):
kcal, protein, fat, carbs, fiber, vitamins A, C, D, E, K, B12 and folate,
and calcium, iron, magnesium, potassium and zinc, with a color for its
picture. A recipe has its meal, servings, minutes, a line about it, its
ingredients (a food, grams in all, and the words as a cook writes them),
extras it is good with, staples (salt, water), and its steps.

A serving's figures are its ingredients' over its servings; extras and
staples are not counted. The daily values are the FDA's for 2,000 kcal.

Recipes are whole foods, cooked in olive oil, butter or ghee (no seed
oils).

## How it is built

`paint.l8` (from the CAD tool's) draws everything as quads one shader
shapes per pixel, in Rubik from `../skate/font.l8`. `food.l8` reads the
book and adds up servings; `kitchen.l8` is the places and their lists, the
ranking, the log of meals, and the kitchen's file; `plate.l8` draws a recipe's plate from its
ingredients; `ui.l8` has buttons, easing, scrolling with momentum, the
search fields and icons; `touch.l8` turns a finger into taps, scrolls and
slides; `book.l8` is the state and what each button does; `pages.l8` draws
the pages. With nothing moving the page stops redrawing.

## Not built yet

Adding or editing recipes and foods in the book itself; renaming a place;
dishes a cafeteria serves made (as against its ingredients); amounts in the
kitchen (it knows only whether a food is there); a shopping list from
what is missing; goals other than the FDA's daily values; sodium, sugar
and the B vitamins besides B12 and folate.
