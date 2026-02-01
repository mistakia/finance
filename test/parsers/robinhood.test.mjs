/* global describe it */

import chai from 'chai'
import dayjs from 'dayjs'

import { parse_transactions } from '../../libs-server/parsers/robinhood.mjs'

chai.should()

const make_order = (overrides = {}) => ({
  id: 'order-abc-123',
  state: 'filled',
  side: 'buy',
  symbol: 'AAPL',
  cumulative_quantity: '10',
  average_price: '150.00',
  last_transaction_at: '2025-01-15T16:30:00Z',
  fees: '0',
  ...overrides
})

describe('robinhood parser', () => {
  it('should parse a buy order', () => {
    const result = parse_transactions({
      items: [make_order()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.from_link.should.equal('/testuser/robinhood/brokerage/default')
    tx.from_amount.should.equal(-1500)
    tx.from_symbol.should.equal('USD')
    tx.to_link.should.equal('/testuser/robinhood/brokerage/default/AAPL')
    tx.to_amount.should.equal(10)
    tx.to_symbol.should.equal('AAPL')
    tx.transaction_date.should.equal('2025-01-15')
    tx.tx_id.should.equal('order-abc-123')
    tx.description.should.equal('BUY 10 AAPL @ 150')
    tx.source_file.should.equal('robinhood-api')
  })

  it('should parse a sell order', () => {
    const result = parse_transactions({
      items: [make_order({ side: 'sell' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/robinhood/brokerage/default/AAPL')
    tx.from_amount.should.equal(-10)
    tx.from_symbol.should.equal('AAPL')
    tx.to_link.should.equal('/testuser/robinhood/brokerage/default')
    tx.to_amount.should.equal(1500)
    tx.to_symbol.should.equal('USD')
    tx.description.should.equal('SELL 10 AAPL @ 150')
  })

  it('should skip non-filled orders', () => {
    const result = parse_transactions({
      items: [
        make_order({ state: 'cancelled' }),
        make_order({ state: 'pending' }),
        make_order({ state: 'filled' })
      ],
      owner: 'testuser'
    })

    result.should.have.length(1)
  })

  it('should include fees when present', () => {
    const result = parse_transactions({
      items: [make_order({ fees: '0.50' })],
      owner: 'testuser'
    })

    result[0].fee_amount.should.equal(0.5)
    result[0].fee_symbol.should.equal('USD')
    result[0].fee_link.should.equal('/testuser/robinhood/brokerage/default')
  })

  it('should not include fee fields when fees are zero', () => {
    const result = parse_transactions({
      items: [make_order({ fees: '0' })],
      owner: 'testuser'
    })

    chai.expect(result[0].fee_amount).to.be.undefined
  })

  it('should use instrument_symbol as fallback', () => {
    const result = parse_transactions({
      items: [make_order({ symbol: undefined, instrument_symbol: 'TSLA' })],
      owner: 'testuser'
    })

    result[0].to_symbol.should.equal('TSLA')
    result[0].description.should.include('TSLA')
  })

  it('should use updated_at as fallback date', () => {
    const result = parse_transactions({
      items: [
        make_order({
          last_transaction_at: null,
          updated_at: '2025-02-01T10:00:00Z'
        })
      ],
      owner: 'testuser'
    })

    result[0].transaction_date.should.equal('2025-02-01')
    result[0].transaction_unix.should.equal(dayjs('2025-02-01T10:00:00Z').unix())
  })

  it('should handle fractional shares', () => {
    const result = parse_transactions({
      items: [make_order({ cumulative_quantity: '0.5', average_price: '200.00' })],
      owner: 'testuser'
    })

    result[0].to_amount.should.equal(0.5)
    result[0].from_amount.should.equal(-100)
  })

  it('should return empty array for empty items', () => {
    const result = parse_transactions({
      items: [],
      owner: 'testuser'
    })

    result.should.have.length(0)
  })
})
