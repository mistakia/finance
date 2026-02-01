/* global describe it */

import chai from 'chai'
import dayjs from 'dayjs'

import { create_balance_assertions } from '../../libs-server/parsers/balance-assertion.mjs'

chai.should()

describe('balance-assertion parser', () => {
  it('should create balance assertions from positions', () => {
    const timestamp = '2025-01-15T12:00:00.000Z'
    const result = create_balance_assertions({
      positions: [
        { symbol: 'AAPL', quantity: 100, account_id: '12345', account_type: 'brokerage' },
        { symbol: 'GOOGL', quantity: 50, account_id: '12345', account_type: 'brokerage' }
      ],
      institution: 'fidelity',
      owner: 'testuser',
      timestamp
    })

    result.should.have.length(2)

    const aapl = result[0]
    aapl.transaction_type.should.equal('balance_assertion')
    aapl.to_link.should.equal('/testuser/fidelity/brokerage/12345')
    aapl.to_amount.should.equal(100)
    aapl.to_symbol.should.equal('AAPL')
    aapl.transaction_date.should.equal('2025-01-15')
    aapl.transaction_unix.should.equal(dayjs(timestamp).unix())
    chai.expect(aapl.from_link).to.be.null
    chai.expect(aapl.from_amount).to.be.null
    chai.expect(aapl.from_symbol).to.be.null
    aapl.source_file.should.equal('fidelity-api')
    aapl.description.should.include('Balance assertion')
    aapl.description.should.include('AAPL')

    const googl = result[1]
    googl.to_amount.should.equal(50)
    googl.to_symbol.should.equal('GOOGL')
  })

  it('should default symbol to USD when not provided', () => {
    const result = create_balance_assertions({
      positions: [{ quantity: 5000, account_id: 'checking' }],
      institution: 'ally-bank',
      owner: 'testuser',
      timestamp: '2025-01-15T00:00:00Z'
    })

    result[0].to_symbol.should.equal('USD')
  })

  it('should use balance field when quantity is not provided', () => {
    const result = create_balance_assertions({
      positions: [{ symbol: 'BTC', balance: 1.5, address: 'abc123' }],
      institution: 'bitcoin',
      owner: 'testuser',
      timestamp: '2025-01-15T00:00:00Z'
    })

    result[0].to_amount.should.equal(1.5)
    result[0].to_link.should.equal('/testuser/bitcoin/brokerage/abc123')
  })

  it('should use address as account_id when account_id is missing', () => {
    const result = create_balance_assertions({
      positions: [{ symbol: 'ETH', quantity: 10, address: 'wallet123' }],
      institution: 'ethereum',
      owner: 'testuser',
      timestamp: '2025-01-15T00:00:00Z'
    })

    result[0].to_link.should.equal('/testuser/ethereum/brokerage/wallet123')
  })

  it('should include cost_basis and market_value in transaction_info', () => {
    const result = create_balance_assertions({
      positions: [
        {
          symbol: 'AAPL',
          quantity: 100,
          account_id: '12345',
          cost_basis: 15000,
          market_value: 17500,
          name: 'Apple Inc'
        }
      ],
      institution: 'schwab',
      owner: 'testuser',
      timestamp: '2025-01-15T00:00:00Z'
    })

    result[0].transaction_info.cost_basis.should.equal(15000)
    result[0].transaction_info.market_value.should.equal(17500)
    result[0].transaction_info.name.should.equal('Apple Inc')
    result[0].transaction_info.assertion_type.should.equal('position_snapshot')
    result[0].transaction_info.institution.should.equal('schwab')
  })

  it('should return empty array for empty positions', () => {
    const result = create_balance_assertions({
      positions: [],
      institution: 'fidelity',
      owner: 'testuser'
    })

    result.should.have.length(0)
  })

  it('should generate unique assertion IDs per symbol and account', () => {
    const result = create_balance_assertions({
      positions: [
        { symbol: 'AAPL', quantity: 100, account_id: 'acc1' },
        { symbol: 'AAPL', quantity: 50, account_id: 'acc2' }
      ],
      institution: 'fidelity',
      owner: 'testuser',
      timestamp: '2025-01-15T00:00:00Z'
    })

    result[0].tx_id.should.not.equal(result[1].tx_id)
    result[0].tx_id.should.include('AAPL')
    result[0].tx_id.should.include('acc1')
    result[1].tx_id.should.include('acc2')
  })
})
