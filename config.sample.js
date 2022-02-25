export default {
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
  }
}
