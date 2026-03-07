/* global describe it */

import chai from 'chai'

import {
  parse_trades,
  parse_deposits,
  parse_withdrawals,
  parse_staking_rewards
} from '../../libs-server/parsers/binance-us.mjs'

chai.should()

const make_trade = (overrides = {}) => ({
  id: 12345,
  symbol: 'BTCUSD',
  price: '40000.00',
  qty: '0.5',
  quoteQty: '20000.00',
  commission: '10.00',
  commissionAsset: 'USD',
  time: 1700000000000,
  isBuyer: true,
  ...overrides
})

describe('binance-us trade parser', () => {
  it('should parse a buy trade', () => {
    const result = parse_trades({
      data: [make_trade()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.from_link.should.equal('/testuser/binance-us/exchange/default')
    tx.from_amount.should.equal(-20000)
    tx.from_symbol.should.equal('USD')
    tx.to_link.should.equal('/testuser/binance-us/exchange/default/BTC')
    tx.to_amount.should.equal(0.5)
    tx.to_symbol.should.equal('BTC')
    tx.fee_amount.should.equal(10)
  })

  it('should parse a sell trade', () => {
    const result = parse_trades({
      data: [make_trade({ isBuyer: false })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/binance-us/exchange/default/BTC')
    tx.from_amount.should.equal(-0.5)
    tx.to_link.should.equal('/testuser/binance-us/exchange/default')
    tx.to_amount.should.equal(20000)
  })

  it('should not include fee when zero', () => {
    const result = parse_trades({
      data: [make_trade({ commission: '0' })],
      owner: 'testuser'
    })

    chai.expect(result[0].fee_amount).to.be.undefined
  })

  it('should generate correct link', () => {
    const result = parse_trades({
      data: [make_trade({ id: 99999 })],
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/binance-us/exchange/default/tx/99999')
  })

  it('should handle empty data', () => {
    parse_trades({ data: [], owner: 'test' }).should.have.length(0)
  })
})

describe('binance-us deposit parser', () => {
  it('should parse a deposit', () => {
    const result = parse_deposits({
      data: [
        {
          txId: 'abc123',
          coin: 'ETH',
          amount: '2.5',
          insertTime: 1700000000000
        }
      ],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.to_link.should.equal('/testuser/binance-us/exchange/default/ETH')
    tx.to_amount.should.equal(2.5)
    chai.expect(tx.from_link).to.be.null
    tx.description.should.include('Deposit')
  })

  it('should handle empty data', () => {
    parse_deposits({ data: [], owner: 'test' }).should.have.length(0)
  })
})

describe('binance-us withdrawal parser', () => {
  it('should parse a withdrawal', () => {
    const result = parse_withdrawals({
      data: [
        {
          id: 'w001',
          txId: 'txhash123',
          coin: 'BTC',
          amount: '0.1',
          transactionFee: '0.0005',
          applyTime: '2024-01-15 12:00:00'
        }
      ],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal('/testuser/binance-us/exchange/default/BTC')
    tx.from_amount.should.equal(-0.1)
    chai.expect(tx.to_link).to.be.null
    tx.fee_amount.should.equal(0.0005)
  })

  it('should not include fee when zero', () => {
    const result = parse_withdrawals({
      data: [
        {
          txId: 'tx001',
          coin: 'ETH',
          amount: '1.0',
          transactionFee: '0',
          applyTime: '2024-01-15 12:00:00'
        }
      ],
      owner: 'testuser'
    })

    chai.expect(result[0].fee_amount).to.be.undefined
  })

  it('should handle empty data', () => {
    parse_withdrawals({ data: [], owner: 'test' }).should.have.length(0)
  })
})

describe('binance-us staking rewards parser', () => {
  it('should parse a staking reward', () => {
    const result = parse_staking_rewards({
      data: [
        {
          id: 1001,
          asset: 'SOL',
          amount: '0.05',
          time: 1700000000000
        }
      ],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('staking_income')
    tx.to_link.should.equal('/testuser/binance-us/exchange/default/SOL')
    tx.to_amount.should.equal(0.05)
    chai.expect(tx.from_link).to.be.null
  })

  it('should handle reward without id', () => {
    const result = parse_staking_rewards({
      data: [
        {
          asset: 'ETH',
          amount: '0.001',
          time: 1700000000000
        }
      ],
      owner: 'testuser'
    })

    result[0].tx_id.should.include('stk-ETH-')
  })

  it('should handle empty data', () => {
    parse_staking_rewards({ data: [], owner: 'test' }).should.have.length(0)
  })
})
