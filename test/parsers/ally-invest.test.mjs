/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/ally-invest.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  date: '2025-03-15T10:30:00Z',
  activity: 'Trade',
  transaction: { security: { sym: 'AAPL' } },
  quantity: '10',
  amount: '1500.00',
  ...overrides
})

const wrap = (txs) => ({ response: { transactions: { transaction: txs } } })

describe('ally-invest parser', () => {
  it('should parse a positive trade', () => {
    const result = parse_transactions({
      data: wrap([make_tx()]),
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.to_link.should.equal('/testuser/ally-invest/brokerage/default')
    tx.to_amount.should.equal(1500)
    tx.to_symbol.should.equal('USD')
    chai.expect(tx.from_link).to.be.null
    tx.source_file.should.equal('ally-invest-api')
  })

  it('should parse a negative amount as outflow', () => {
    const result = parse_transactions({
      data: wrap([make_tx({ amount: '-500.00' })]),
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/ally-invest/brokerage/default')
    tx.from_amount.should.equal(-500)
    tx.to_amount.should.equal(500)
    chai.expect(tx.to_link).to.be.null
  })

  it('should classify non-trade activity as transfer', () => {
    const result = parse_transactions({
      data: wrap([make_tx({ activity: 'Dividend' })]),
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: wrap([make_tx()]),
      owner: 'pk123'
    })

    result[0].link.should.include('/pk123/ally-invest/brokerage/default/tx/')
  })

  it('should handle single transaction (not array)', () => {
    const result = parse_transactions({
      data: { response: { transactions: { transaction: make_tx() } } },
      owner: 'testuser'
    })

    result.should.have.length(1)
  })

  it('should handle empty data', () => {
    parse_transactions({ data: {}, owner: 'test' }).should.have.length(0)
  })
})
