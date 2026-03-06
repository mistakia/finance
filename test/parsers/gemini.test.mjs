/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/gemini.mjs'

chai.should()

const make_trade = (overrides = {}) => ({
  tid: 12345,
  timestamp: 1700000000000,
  symbol: 'btcusd',
  type: 'Buy',
  amount: '0.5',
  price: '40000.00',
  fee_amount: '10.00',
  fee_currency: 'USD',
  ...overrides
})

describe('gemini parser', () => {
  it('should parse a buy trade', () => {
    const result = parse_transactions({
      data: [make_trade()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.from_link.should.equal('/testuser/gemini/exchange/default')
    tx.from_amount.should.equal(-20000)
    tx.from_symbol.should.equal('USD')
    tx.to_link.should.equal('/testuser/gemini/exchange/default/BTC')
    tx.to_amount.should.equal(0.5)
    tx.to_symbol.should.equal('BTC')
    tx.fee_amount.should.equal(10)
    tx.fee_symbol.should.equal('USD')
    tx.source_file.should.equal('gemini-api')
  })

  it('should parse a sell trade', () => {
    const result = parse_transactions({
      data: [make_trade({ type: 'Sell' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/gemini/exchange/default/BTC')
    tx.from_amount.should.equal(-0.5)
    tx.from_symbol.should.equal('BTC')
    tx.to_link.should.equal('/testuser/gemini/exchange/default')
    tx.to_amount.should.equal(20000)
    tx.to_symbol.should.equal('USD')
  })

  it('should not include fee when zero', () => {
    const result = parse_transactions({
      data: [make_trade({ fee_amount: '0' })],
      owner: 'testuser'
    })

    chai.expect(result[0].fee_amount).to.be.undefined
  })

  it('should extract symbol pair correctly', () => {
    const result = parse_transactions({
      data: [make_trade({ symbol: 'ethusd', amount: '2', price: '3000' })],
      owner: 'testuser'
    })

    result[0].to_symbol.should.equal('ETH')
    result[0].from_symbol.should.equal('USD')
  })

  it('should generate correct link', () => {
    const result = parse_transactions({
      data: [make_trade({ tid: 99999 })],
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/gemini/exchange/default/tx/99999')
  })

  it('should handle empty data', () => {
    parse_transactions({ data: [], owner: 'test' }).should.have.length(0)
  })
})
