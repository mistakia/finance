/* global describe it */

import chai from 'chai'

import {
  parse_transactions,
  parse_transfers,
  parse_staking_history
} from '../../libs-server/parsers/gemini.mjs'

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

const make_transfer = (overrides = {}) => ({
  eid: 67890,
  timestampms: 1700000000000,
  type: 'Deposit',
  currency: 'BTC',
  amount: '1.5',
  feeAmount: '0',
  ...overrides
})

describe('gemini transfer parser', () => {
  it('should parse a deposit', () => {
    const result = parse_transfers({
      data: [make_transfer()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.to_link.should.equal('/testuser/gemini/exchange/default/BTC')
    tx.to_amount.should.equal(1.5)
    tx.to_symbol.should.equal('BTC')
    chai.expect(tx.from_link).to.be.null
    tx.description.should.include('Deposit')
  })

  it('should parse a withdrawal', () => {
    const result = parse_transfers({
      data: [make_transfer({ type: 'Withdrawal', amount: '-0.5' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal('/testuser/gemini/exchange/default/BTC')
    tx.from_amount.should.equal(-0.5)
    tx.from_symbol.should.equal('BTC')
    chai.expect(tx.to_link).to.be.null
    tx.description.should.include('Withdrawal')
  })

  it('should skip reward type transfers', () => {
    const result = parse_transfers({
      data: [make_transfer({ type: 'Reward' })],
      owner: 'testuser'
    })

    result.should.have.length(0)
  })

  it('should include fee when present', () => {
    const result = parse_transfers({
      data: [make_transfer({ type: 'Withdrawal', amount: '-0.5', feeAmount: '0.001' })],
      owner: 'testuser'
    })

    result[0].fee_amount.should.equal(0.001)
    result[0].fee_symbol.should.equal('BTC')
  })

  it('should generate correct link', () => {
    const result = parse_transfers({
      data: [make_transfer({ eid: 11111 })],
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/gemini/exchange/default/tx/11111')
  })

  it('should handle empty data', () => {
    parse_transfers({ data: [], owner: 'test' }).should.have.length(0)
  })
})

const make_staking_entry = (overrides = {}) => ({
  transactionId: 'stk-001',
  transactionType: 'Interest',
  amount: '0.00025',
  amountCurrency: 'ETH',
  dateTime: '2024-01-15T12:00:00.000Z',
  ...overrides
})

describe('gemini staking history parser', () => {
  it('should parse an interest reward', () => {
    const result = parse_staking_history({
      data: [make_staking_entry()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('staking_income')
    tx.to_link.should.equal('/testuser/gemini/staking/default/ETH')
    tx.to_amount.should.equal(0.00025)
    tx.to_symbol.should.equal('ETH')
    chai.expect(tx.from_link).to.be.null
    tx.description.should.include('Staking reward')
  })

  it('should parse a staking deposit as transfer', () => {
    const result = parse_staking_history({
      data: [make_staking_entry({ transactionType: 'Deposit', amount: '1.0' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal('/testuser/gemini/exchange/default/ETH')
    tx.from_amount.should.equal(-1)
    tx.to_link.should.equal('/testuser/gemini/staking/default/ETH')
    tx.to_amount.should.equal(1)
  })

  it('should parse a staking redeem as transfer', () => {
    const result = parse_staking_history({
      data: [make_staking_entry({ transactionType: 'Redeem', amount: '-1.0' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal('/testuser/gemini/staking/default/ETH')
    tx.to_link.should.equal('/testuser/gemini/exchange/default/ETH')
  })

  it('should generate correct staking link', () => {
    const result = parse_staking_history({
      data: [make_staking_entry({ transactionId: 'stk-999' })],
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/gemini/staking/default/tx/stk-999')
  })

  it('should handle empty data', () => {
    parse_staking_history({ data: [], owner: 'test' }).should.have.length(0)
  })
})
