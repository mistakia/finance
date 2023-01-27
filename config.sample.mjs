export default {
  port: 8080, // api port

  url: 'http://localhost:8081',

  morningstar: {
    search_api_key: '',
    data_api_key: ''
  },

  ethplorer_api: '',

  alphavantage: '',
  mysql: {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      user: 'root',
      // password: 'xxxxx',
      database: 'finance_development',
      decimalNumbers: true
    },
    pool: {
      min: 2,
      max: 10
    }
  },
  koinly: {
    auth_token: '',
    portfolio_token: '',
    cookie: ''
  },
  links: {
    ally: {
      consumer_key: '',
      consumer_secret: '',
      oauth_key: '',
      oauth_secret: ''
    },
    ally_bank: {
      username: '',
      password: ''
    },
    robinhood: {
      username: '',
      password: ''
    },
    peerstreet: {
      username: '',
      password: ''
    },
    gemini: {
      key: '',
      secret: ''
    },
    bitcoin: {
      address: ''
    },
    nano: {
      address: ''
    },
    ethereum: {
      address: ''
    },
    wealthfront: {
      email: '',
      password: ''
    }
  }
}
