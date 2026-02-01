/* global describe it */

import chai from 'chai'
import dayjs from 'dayjs'

import { parse_transactions } from '../../libs-server/parsers/koinly.mjs'

chai.should()

const make_item = (overrides = {}) => ({
  id: 'txn-123',
  type: 'exchange',
  date: '2025-01-15T12:00:00Z',
  label: null,
  description: 'Test transaction',
  txhash: 'hash123',
  txsrc: null,
  txdest: null,
  from: {
    amount: '100',
    currency: { symbol: 'USD' },
    wallet: { name: 'Coinbase' }
  },
  to: {
    amount: '0.005',
    currency: { symbol: 'BTC' },
    wallet: { name: 'Coinbase' }
  },
  fee: {
    amount: '1.50',
    currency: { symbol: 'USD' },
    wallet: { name: 'Coinbase' }
  },
  ...overrides
})

describe('koinly parser', () => {
  it('should parse exchange transactions', () => {
    const result = parse_transactions({
      items: [make_item()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.link.should.equal('/testuser/koinly/txn-123')
    tx.from_link.should.equal('/testuser/coinbase/USD')
    tx.from_amount.should.equal(100)
    tx.from_symbol.should.equal('USD')
    tx.to_link.should.equal('/testuser/coinbase/BTC')
    tx.to_amount.should.equal(0.005)
    tx.to_symbol.should.equal('BTC')
    tx.fee_amount.should.equal(1.5)
    tx.fee_symbol.should.equal('USD')
    tx.transaction_date.should.equal('2025-01-15')
    tx.transaction_unix.should.equal(dayjs('2025-01-15T12:00:00Z').unix())
    tx.source_file.should.equal('koinly-api')
  })

  it('should parse crypto_deposit as transfer when no income label', () => {
    const result = parse_transactions({
      items: [make_item({ type: 'crypto_deposit', label: null })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should parse crypto_deposit as income when staking label', () => {
    const income_labels = ['staking', 'other_income', 'airdrop', 'mining', 'loan_interest', 'fork']

    for (const label of income_labels) {
      const result = parse_transactions({
        items: [make_item({ type: 'crypto_deposit', label })],
        owner: 'testuser'
      })

      result[0].transaction_type.should.equal('income')
    }
  })

  it('should parse crypto_withdrawal as purchase', () => {
    const result = parse_transactions({
      items: [make_item({ type: 'crypto_withdrawal' })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('purchase')
  })

  it('should parse fiat_deposit as transfer', () => {
    const result = parse_transactions({
      items: [make_item({ type: 'fiat_deposit' })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should parse fiat_withdrawal as transfer', () => {
    const result = parse_transactions({
      items: [make_item({ type: 'fiat_withdrawal' })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should parse buy/sell as exchange', () => {
    const buy = parse_transactions({
      items: [make_item({ type: 'buy' })],
      owner: 'testuser'
    })
    buy[0].transaction_type.should.equal('exchange')

    const sell = parse_transactions({
      items: [make_item({ type: 'sell' })],
      owner: 'testuser'
    })
    sell[0].transaction_type.should.equal('exchange')
  })

  it('should throw on unrecognized type', () => {
    chai
      .expect(() =>
        parse_transactions({
          items: [make_item({ type: 'unknown_type' })],
          owner: 'testuser'
        })
      )
      .to.throw('unrecognized type')
  })

  it('should handle wallet name with spaces', () => {
    const result = parse_transactions({
      items: [
        make_item({
          from: {
            amount: '100',
            currency: { symbol: 'USD' },
            wallet: { name: 'My Ledger Wallet' }
          }
        })
      ],
      owner: 'testuser'
    })

    result[0].from_link.should.equal('/testuser/my-ledger-wallet/USD')
  })

  it('should set to_link from txdest when to_link is missing', () => {
    const result = parse_transactions({
      items: [
        make_item({
          to: null,
          txdest: 'destination_addr',
          from: {
            amount: '1',
            currency: { symbol: 'BTC' },
            wallet: { name: 'Coinbase' }
          }
        })
      ],
      owner: 'testuser'
    })

    result[0].to_link.should.equal('/testuser/self/BTC/destination_addr')
  })

  it('should set from_link from txsrc when from_link is missing', () => {
    const result = parse_transactions({
      items: [
        make_item({
          from: null,
          txsrc: 'source_addr',
          to: {
            amount: '1',
            currency: { symbol: 'ETH' },
            wallet: { name: 'Coinbase' }
          }
        })
      ],
      owner: 'testuser'
    })

    result[0].from_link.should.equal('/testuser/self/ETH/source_addr')
  })

  it('should handle null fee', () => {
    const result = parse_transactions({
      items: [make_item({ fee: null })],
      owner: 'testuser'
    })

    chai.expect(result[0].fee_amount).to.be.null
    chai.expect(result[0].fee_symbol).to.be.null
  })
})
