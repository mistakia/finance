/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/wealthfront.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  id: 'wf-tx-001',
  date: '2025-06-15T12:00:00Z',
  type: 'transfer',
  amount: 250.00,
  accountId: 'acct-123',
  accountType: 'brokerage',
  description: 'Deposit from bank',
  ...overrides
})

describe('wealthfront parser', () => {
  it('should parse a positive transfer', () => {
    const result = parse_transactions({
      data: { activities: [make_tx()] },
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.to_link.should.equal('/testuser/wealthfront/brokerage/acct-123')
    tx.to_amount.should.equal(250)
    tx.to_symbol.should.equal('USD')
    chai.expect(tx.from_link).to.be.null
    tx.source_file.should.equal('wealthfront-api')
  })

  it('should parse a negative amount as outflow', () => {
    const result = parse_transactions({
      data: { activities: [make_tx({ amount: -100.00 })] },
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/wealthfront/brokerage/acct-123')
    tx.from_amount.should.equal(-100)
    tx.to_amount.should.equal(100)
    chai.expect(tx.to_link).to.be.null
  })

  it('should classify dividend type', () => {
    const result = parse_transactions({
      data: { activities: [make_tx({ type: 'dividend_payment' })] },
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('dividend')
  })

  it('should classify exchange type', () => {
    const result = parse_transactions({
      data: { activities: [make_tx({ type: 'rebalance' })] },
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('exchange')
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: { activities: [make_tx()] },
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/wealthfront/brokerage/acct-123/tx/wf-tx-001')
  })

  it('should use fallback fields', () => {
    const result = parse_transactions({
      data: [{ createdAt: '2025-01-01T00:00:00Z', activityType: 'transfer', value: 50, account_id: 'a1', transactionId: 't1' }],
      owner: 'testuser'
    })

    result.should.have.length(1)
    result[0].tx_id.should.equal('t1')
    result[0].to_amount.should.equal(50)
  })

  it('should handle empty data', () => {
    parse_transactions({ data: { activities: [] }, owner: 'test' }).should.have.length(0)
  })
})
