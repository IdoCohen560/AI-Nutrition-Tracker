// Map food keywords -> emoji. More specific first.
const RULES = [
  // Drinks
  [/\b(coffee|espresso|latte|cappuccino|mocha)\b/i, '☕'],
  [/\b(tea|matcha)\b/i, '🍵'],
  [/\b(water)\b/i, '💧'],
  [/\b(beer|lager|ale|ipa)\b/i, '🍺'],
  [/\b(wine|merlot|cabernet|chardonnay)\b/i, '🍷'],
  [/\b(cocktail|martini|margarita)\b/i, '🍸'],
  [/\b(whiskey|bourbon|scotch|rum|vodka|tequila)\b/i, '🥃'],
  [/\b(juice|smoothie|shake)\b/i, '🥤'],
  [/\b(milk)\b/i, '🥛'],
  [/\b(soda|cola|coke|pepsi|sprite|fanta)\b/i, '🥤'],

  // Breakfast
  [/\b(pancake|pancakes)\b/i, '🥞'],
  [/\b(waffle|waffles)\b/i, '🧇'],
  [/\b(bacon)\b/i, '🥓'],
  [/\b(egg|eggs|omelet|omelette|frittata)\b/i, '🥚'],
  [/\b(cereal|granola|oats|oatmeal|porridge)\b/i, '🥣'],
  [/\b(yogurt|yoghurt)\b/i, '🍦'],
  [/\b(bagel)\b/i, '🥯'],
  [/\b(toast|bread|baguette|croissant)\b/i, '🥐'],

  // Proteins / mains
  [/\b(chicken|nugget|nuggets|tender|tenders|wings|drumstick)\b/i, '🍗'],
  [/\b(turkey)\b/i, '🦃'],
  [/\b(steak|beef|brisket|ribeye|filet)\b/i, '🥩'],
  [/\b(pork|ham|sausage|hot ?dog|frank)\b/i, '🌭'],
  [/\b(fish|salmon|tuna|cod|trout|bass|tilapia)\b/i, '🐟'],
  [/\b(shrimp|prawn|lobster|crab)\b/i, '🦐'],
  [/\b(sushi|sashimi|maki|nigiri)\b/i, '🍣'],
  [/\b(burger|cheeseburger|hamburger)\b/i, '🍔'],
  [/\b(pizza)\b/i, '🍕'],
  [/\b(taco|tacos)\b/i, '🌮'],
  [/\b(burrito|wrap)\b/i, '🌯'],
  [/\b(sandwich|sub|panini)\b/i, '🥪'],
  [/\b(pasta|spaghetti|penne|linguine|fettuccine|lasagna|mac.?and.?cheese|ravioli)\b/i, '🍝'],
  [/\b(noodle|noodles|ramen|udon|pho)\b/i, '🍜'],
  [/\b(curry)\b/i, '🍛'],
  [/\b(dumpling|dumplings|gyoza|pierogi)\b/i, '🥟'],
  [/\b(rice|risotto|pilaf)\b/i, '🍚'],
  [/\b(salad|greens|lettuce|kale|spinach|arugula)\b/i, '🥗'],
  [/\b(soup|stew|chili|broth|gumbo)\b/i, '🍲'],

  // Sides
  [/\b(fries|chips|french fry)\b/i, '🍟'],
  [/\b(potato|mashed|hash brown)\b/i, '🥔'],
  [/\b(corn)\b/i, '🌽'],
  [/\b(broccoli)\b/i, '🥦'],
  [/\b(carrot)\b/i, '🥕'],
  [/\b(tomato|tomatoes|marinara)\b/i, '🍅'],
  [/\b(avocado|guacamole)\b/i, '🥑'],
  [/\b(pickle|cucumber)\b/i, '🥒'],
  [/\b(eggplant|aubergine)\b/i, '🍆'],
  [/\b(bell pepper|pepper)\b/i, '🫑'],
  [/\b(mushroom)\b/i, '🍄'],
  [/\b(onion|garlic)\b/i, '🧅'],
  [/\b(beans?|legume|lentil|chickpea|hummus)\b/i, '🫘'],

  // Snacks / sweets
  [/\b(donut|doughnut)\b/i, '🍩'],
  [/\b(cookie|cookies|biscuit)\b/i, '🍪'],
  [/\b(cake|cupcake|brownie)\b/i, '🍰'],
  [/\b(pie)\b/i, '🥧'],
  [/\b(chocolate|fudge|truffle)\b/i, '🍫'],
  [/\b(candy|gummy|gummies)\b/i, '🍬'],
  [/\b(ice cream|gelato|sorbet)\b/i, '🍨'],
  [/\b(popcorn)\b/i, '🍿'],
  [/\b(pretzel)\b/i, '🥨'],
  [/\b(cheese)\b/i, '🧀'],

  // Fruit
  [/\b(apple)\b/i, '🍎'],
  [/\b(banana)\b/i, '🍌'],
  [/\b(orange|tangerine|mandarin)\b/i, '🍊'],
  [/\b(grape|grapes)\b/i, '🍇'],
  [/\b(strawberry|strawberries)\b/i, '🍓'],
  [/\b(blueberry|blueberries|raspberry|blackberry)\b/i, '🫐'],
  [/\b(watermelon|melon)\b/i, '🍉'],
  [/\b(pineapple)\b/i, '🍍'],
  [/\b(mango)\b/i, '🥭'],
  [/\b(peach|nectarine|apricot)\b/i, '🍑'],
  [/\b(pear)\b/i, '🍐'],
  [/\b(cherry|cherries)\b/i, '🍒'],
  [/\b(kiwi)\b/i, '🥝'],
  [/\b(lemon|lime)\b/i, '🍋'],
  [/\b(coconut)\b/i, '🥥'],

  // Nuts / protein bars
  [/\b(peanut|peanut butter|almond|cashew|walnut|nut|nuts|trail mix)\b/i, '🥜'],
  [/\b(protein bar|granola bar|cliff bar|kind bar|bar)\b/i, '🍫'],
  [/\b(protein|whey|isolate|shake)\b/i, '🥛'],

  // Misc / fallback meal-y
  [/\b(salsa|dip|sauce)\b/i, '🥫'],
  [/\b(honey|jam|jelly)\b/i, '🍯'],
];

const MEAL_FALLBACK = {
  breakfast: '🍳',
  lunch: '🥗',
  dinner: '🍽️',
  snacks: '🥨',
  snack: '🥨',
};

export function foodEmoji(name, mealType) {
  if (!name) return MEAL_FALLBACK[mealType] || '🍽️';
  for (const [re, emoji] of RULES) {
    if (re.test(name)) return emoji;
  }
  return MEAL_FALLBACK[mealType] || '🍽️';
}
