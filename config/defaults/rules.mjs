// Default merchant category rules configuration
export default [
  // Food
  {
    pattern: /wholefds|trader joe|safeway|giant|harris teeter|publix/i,
    categories: ['food.food_groceries']
  },
  {
    pattern:
      /^chipotle|^tst\*|potbelly|menomale|restaurant|doordash|grubhub|uber eats|pizza|cafe|diner|bistro|kitchen|grill|papa johns|five guys|domino's|5guys/i,
    categories: ['food.food_restaurants']
  },

  // Home
  {
    pattern:
      /home depot|homedepot|lowes|ace hardware|menards|lumber|ferguson|concrete polishing|prolighting|supplyhouse\.com|tractor supply|genuine parts/i,
    categories: ['home.home_improvement', 'goods']
  },
  {
    pattern: /state farm|geico|progressive|allstate.*home/i,
    categories: ['home.home_insurance']
  },
  { pattern: /mortgage/i, categories: ['home.home_mortgage'] },
  {
    pattern: /pepco|dominion power|electric utility/i,
    categories: ['home.home_electric']
  },
  {
    pattern: /comcast|verizon fios|cox|spectrum/i,
    categories: ['home.home_internet']
  },

  // Health
  {
    pattern: /cvs|pharmacy|walgreens|rite aid|duane reade/i,
    categories: ['health.pharmacy', 'goods']
  },
  {
    pattern: /dental|dentist|orthodontic/i,
    categories: ['health.dental']
  },

  // Travel
  {
    pattern: /airline|delta|united|american air|southwest|jetblue|hawaiian/i,
    categories: ['travel.air_travel']
  },
  {
    pattern: /hotel|airbnb|vrbo|marriott|hilton|hyatt/i,
    categories: ['travel.housing']
  },
  {
    pattern: /avis|hertz|enterprise|national car rental/i,
    categories: ['travel.vehicle_rental']
  },
  {
    pattern:
      /smartrip|metro|subway|bus|transit|amtrak|bart|path|mta|cta|wmata/i,
    categories: ['public_transportation']
  },

  // Fees
  { pattern: /fee.*bank|bank.*fee/i, categories: ['fees.bank_fee'] },
  { pattern: /fee.*late|late.*fee/i, categories: ['fees.late_fee'] },
  {
    pattern: /parking ticket|traffic ticket|citation/i,
    categories: ['fees.tickets']
  },
  {
    pattern: /renewal membership fee/i,
    categories: ['fees']
  },

  // Transfer/Payments
  {
    pattern: /autopay|automatic payment|credit card payment/i,
    categories: ['transfer.credit_card_payment']
  },
  {
    pattern:
      /^(?!.*chipotle)(?!.*t j maxx)(?!.*tj maxx)(?!.*publix)(?!.*renewal membership fee)(?!.*intuit \*turbotax).*(?:transfer|ach|wire|kraken|composer)/i,
    categories: ['transfer.bank_transfer']
  },

  // Vehicle
  {
    pattern:
      /exxon|shell|mobil|bp|sunoco|citgo|gas station|marathon petr|wawa fuel|liberty(?!\s+mutual)|econoway/i,
    categories: ['vehicle.vehicle_gas']
  },
  {
    pattern:
      /autozone|o'reilly|advance auto|napa|carquest|rock auto|partsdiscount\.com/i,
    categories: ['vehicle.vehicle_parts', 'goods']
  },
  {
    pattern:
      /auto repair|midas|firestone|mechanic|auto service|land cruiser heaven|auto tech service|line x of|auto tech/i,
    categories: ['vehicle.vehicle_repair', 'services']
  },
  {
    pattern: /geico|progressive|allstate.*auto|state farm.*auto/i,
    categories: ['vehicle.vehicle_insurance']
  },

  // Pet
  {
    pattern: /chewy|petco|petsmart|pet supplies/i,
    categories: ['pet.pet_food_supplies', 'goods']
  },

  // Goods
  {
    pattern:
      /llbean|gap|old navy|macy|nordstrom|tj maxx|t j maxx|marshalls|h&m|uniqlo|clothing|apparel/i,
    categories: ['goods.clothing']
  },
  {
    pattern:
      /target|target\.com|walmart|costco|sams club|big lots|dollar tree|dollar general|family dollar/i,
    categories: ['goods']
  },
  {
    pattern:
      /rei|north face|patagonia|outdoor gear|sporting goods|ikea|ebay|best buy|amazon/i,
    categories: ['goods']
  },

  // Services
  {
    pattern: /^(?:att|verizon|t-mobile|sprint)(?:\s+wireless)?$/i,
    categories: ['services.mobile_phone']
  },
  {
    pattern: /kaiser|cigna|aetna|bluecross|anthem/i,
    categories: ['services.health_insurance']
  },
  {
    pattern:
      /contabo|linode|digitalocean|digitalocea|aws|amazon web services|heroku|netlify|vercel|hostgator|bluehost|godaddy|namecheap|name-cheap|dreamhost/i,
    categories: ['services.hosting']
  },
  {
    pattern:
      /google\*gsui|google \*gsu|google gsui|google\s+gsu|google workspace|microsoft 365|office 365|adobe|dropbox|github|notion|atlassian|jetbrains|slack|zoom|canva|apple\.com\/bill|intuit \*turbotax/i,
    categories: ['services.software']
  },

  // Income
  {
    pattern: /interest paid|dividend/i,
    categories: ['income.interest_income']
  },

  // Investments
  {
    pattern:
      /peerstreet|vanguard|fidelity|schwab|robinhood|wealthfront|coinbase|kraken|treas 310|treasury|composer/i,
    categories: ['investments']
  },

  // Tax
  {
    pattern: /intuit \*turbotax/i,
    categories: ['tax']
  },
  {
    pattern: /irs|usataxpymt|federal tax|treasury tax/i,
    categories: ['tax.federal']
  }
]
