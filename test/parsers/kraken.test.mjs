/* global describe it */

import chai from 'chai'

import { parse_ledger_entries, parse_trades } from '../../libs-server/parsers/kraken.mjs'
import { normalizeAssetSymbol } from '../../libs-shared/kraken.mjs'

chai.should()

describe('kraken symbol normalization', () => {
  it('should normalize XXBT to BTC', () => {
    normalizeAssetSymbol('XXBT').should.equal('BTC')
  })

  it('should normalize XETH to ETH', () => {
    normalizeAssetSymbol('XETH').should.equal('ETH')
  })

  it('should normalize ZUSD to USD', () => {
    normalizeAssetSymbol('ZUSD').should.equal('USD')
  })

  it('should strip .S suffix', () => {
    normalizeAssetSymbol('XETH.S').should.equal('ETH')
  })

  it('should strip .B suffix', () => {
    normalizeAssetSymbol('DOT.B').should.equal('DOT')
  })

  it('should pass through simple symbols', () => {
    normalizeAssetSymbol('SOL').should.equal('SOL')
  })

  it('should handle unknown 4-char X/Z prefixed symbols', () => {
    normalizeAssetSymbol('XADA').should.equal('ADA')
  })
})

const make_ledger = (id, overrides = {}) => [
  id,
  {
    refid: 'ref-001',
    time: 1700000000,
    type: 'deposit',
    asset: 'XXBT',
    amount: '1.5',
    fee: '0',
    balance: '1.5',
    ...overrides
  }
]

describe('kraken ledger parser', () => {
  it('should parse a deposit', () => {
    const data = Object.fromEntries([make_ledger('L001')])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.to_link.should.equal('/testuser/kraken/exchange/default/BTC')
    tx.to_amount.should.equal(1.5)
    tx.to_symbol.should.equal('BTC')
    chai.expect(tx.from_link).to.be.null
  })

  it('should parse a withdrawal', () => {
    const data = Object.fromEntries([
      make_ledger('L002', { type: 'withdrawal', amount: '-0.5', fee: '0.0001' })
    ])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal('/testuser/kraken/exchange/default/BTC')
    tx.from_amount.should.equal(-0.5)
    chai.expect(tx.to_link).to.be.null
    tx.fee_amount.should.equal(0.0001)
  })

  it('should parse a trade ledger entry', () => {
    const data = Object.fromEntries([
      make_ledger('L003', { type: 'trade', amount: '-500.00', asset: 'ZUSD' })
    ])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
  })

  it('should parse a staking reward', () => {
    const data = Object.fromEntries([
      make_ledger('L004', { type: 'staking', amount: '0.001', asset: 'XETH.S' })
    ])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    const tx = result[0]
    tx.transaction_type.should.equal('staking_income')
    tx.to_symbol.should.equal('ETH')
    tx.to_amount.should.equal(0.001)
  })

  it('should parse a dividend', () => {
    const data = Object.fromEntries([
      make_ledger('L005', { type: 'dividend', amount: '0.05', asset: 'DOT.S' })
    ])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    result[0].transaction_type.should.equal('staking_income')
  })

  it('should parse a transfer', () => {
    const data = Object.fromEntries([
      make_ledger('L006', { type: 'transfer', amount: '10.0', asset: 'SOL' })
    ])
    const result = parse_ledger_entries({ data, owner: 'testuser' })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should generate correct link', () => {
    const data = Object.fromEntries([make_ledger('L-ABC-123')])
    const result = parse_ledger_entries({ data, owner: 'pk123' })

    result[0].link.should.equal('/pk123/kraken/exchange/default/tx/L-ABC-123')
  })

  it('should handle empty data', () => {
    parse_ledger_entries({ data: {}, owner: 'test' }).should.have.length(0)
  })
})

const make_trade = (id, overrides = {}) => [
  id,
  {
    ordertxid: 'O001',
    pair: 'XXBTZUSD',
    time: 1700000000,
    type: 'buy',
    price: '40000.00',
    cost: '20000.00',
    fee: '10.00',
    vol: '0.5',
    ...overrides
  }
]

describe('kraken trade parser', () => {
  it('should parse a buy trade', () => {
    const data = Object.fromEntries([make_trade('T001')])
    const result = parse_trades({ data, owner: 'testuser' })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.from_link.should.equal('/testuser/kraken/exchange/default')
    tx.from_amount.should.equal(-20000)
    tx.from_symbol.should.equal('USD')
    tx.to_link.should.equal('/testuser/kraken/exchange/default/BTC')
    tx.to_amount.should.equal(0.5)
    tx.to_symbol.should.equal('BTC')
    tx.fee_amount.should.equal(10)
  })

  it('should parse a sell trade', () => {
    const data = Object.fromEntries([make_trade('T002', { type: 'sell' })])
    const result = parse_trades({ data, owner: 'testuser' })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/kraken/exchange/default/BTC')
    tx.from_amount.should.equal(-0.5)
    tx.from_symbol.should.equal('BTC')
    tx.to_link.should.equal('/testuser/kraken/exchange/default')
    tx.to_amount.should.equal(20000)
    tx.to_symbol.should.equal('USD')
  })

  it('should parse slash-separated pairs', () => {
    const data = Object.fromEntries([
      make_trade('T003', { pair: 'ETH/USD', vol: '2.0', price: '3000', cost: '6000' })
    ])
    const result = parse_trades({ data, owner: 'testuser' })

    result[0].to_symbol.should.equal('ETH')
    result[0].from_symbol.should.equal('USD')
  })

  it('should not include fee when zero', () => {
    const data = Object.fromEntries([make_trade('T004', { fee: '0' })])
    const result = parse_trades({ data, owner: 'testuser' })

    chai.expect(result[0].fee_amount).to.be.undefined
  })

  it('should generate correct trade link', () => {
    const data = Object.fromEntries([make_trade('T-XYZ')])
    const result = parse_trades({ data, owner: 'pk123' })

    result[0].link.should.equal('/pk123/kraken/exchange/default/trade/T-XYZ')
  })

  it('should handle empty data', () => {
    parse_trades({ data: {}, owner: 'test' }).should.have.length(0)
  })
})
