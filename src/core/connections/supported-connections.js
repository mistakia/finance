export const CONNECTIONS = [
  {
    id: 'ally-bank',
    name: 'Ally Bank',
    url: 'https://www.ally.com/',
    jobs: ['ally-bank/accounts'],
    params: ['username', 'password'],
    params_id: 'username'
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    url: 'https://robinhood.com/',
    jobs: ['robinhood/accounts'],
    params: ['username', 'password'],
    params_id: 'username'
  },
  {
    id: 'ally-invest',
    name: 'Ally Invest',
    url: 'https://www.ally.com/invest/',
    jobs: ['ally-invest/accounts'],
    params: ['consumer_key', 'consumer_secret', 'oauth_key', 'oauth_secret'],
    params_id: 'consumer_key'
  },
  {
    id: 'koinly',
    name: 'Koinly',
    jobs: [],
    url: 'https://koinly.io/',
    params: ['auth_token', 'portfolio_token', 'cookie'],
    params_id: 'portfolio_token'
  },
  {
    id: 'peerstreet',
    name: 'Peerstreet',
    url: 'https://www.peerstreet.com/',
    jobs: ['peerstreet/accounts'],
    params: ['username', 'password'],
    params_id: 'username'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    jobs: ['gemini/accounts'],
    url: 'https://www.gemini.com/',
    params: ['key', 'secret'],
    params_id: 'key'
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    jobs: ['bitcoin/accounts'],
    url: 'https://bitcoin.org/en/',
    params: ['address'],
    params_id: 'address'
  },
  {
    id: 'litecoin',
    name: 'Litecoin',
    jobs: ['litecoin/account'],
    url: 'https://litecoin.org/',
    params: ['address'],
    params_id: 'address'
  },
  {
    id: 'nano',
    name: 'Nano',
    jobs: ['nano/accounts'],
    url: 'https://nano.org/',
    params: ['address'],
    params_id: 'address'
  },
  {
    id: 'stellar',
    name: 'Stellar',
    jobs: ['stellar/accounts'],
    url: 'https://stellar.org/',
    params: ['address'],
    params_id: 'address'
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    jobs: ['ethereum/accounts'],
    url: 'https://ethereum.org/',
    params: ['address'],
    params_id: 'address'
  },
  {
    id: 'wealthfront',
    name: 'Wealthfront',
    url: 'https://www.wealthfront.com/',
    jobs: ['wealthfront/accounts'],
    params: ['email', 'password'],
    params_id: 'email'
  },
  {
    id: 'groundfloor',
    name: 'Groundfloor',
    url: 'https://groundfloor.us/',
    jobs: ['groundfloor/accounts'],
    params: ['email', 'token'],
    params_id: 'email'
  },
  {
    id: 'schwab',
    name: 'Charles Schwab',
    url: 'https://www.schwab.com/',
    jobs: ['schwab/accounts'],
    params: ['username', 'password'],
    params_id: 'username'
  },
  {
    id: 'interactive_brokers',
    name: 'Interactive Brokers',
    url: 'https://www.interactivebrokers.com/',
    jobs: ['interactive_brokers/accounts'],
    params: ['host', 'port'],
    params_id: 'host'
  }
]
