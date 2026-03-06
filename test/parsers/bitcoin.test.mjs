/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/bitcoin.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  hash: 'abc123def456',
  time: 1700000000,
  fee: 10000,
  inputs: [
    {
      prev_out: {
        addr: '1SenderAddr',
        value: 50000000
      }
    }
  ],
  out: [
    { addr: '1ReceiverAddr', value: 49990000 },
    { addr: '1SenderAddr', value: 0 }
  ],
  ...overrides
})

describe('bitcoin parser', () => {
  it('should parse a receive transaction', () => {
    const tx = make_tx()
    const result = parse_transactions({
      data: [tx],
      owner: 'testuser',
      address: '1ReceiverAddr'
    })

    result.should.have.length(1)
    const parsed = result[0]
    parsed.transaction_type.should.equal('receive')
    parsed.to_link.should.equal('/testuser/bitcoin/wallet/1ReceiverAddr')
    parsed.to_amount.should.equal(0.4999)
    parsed.to_symbol.should.equal('BTC')
    parsed.tx_id.should.equal('abc123def456')
    parsed.source_file.should.equal('bitcoin-blockchain-info')
    chai.expect(parsed.fee_amount).to.be.undefined
  })

  it('should parse a send transaction', () => {
    const tx = make_tx({
      inputs: [
        { prev_out: { addr: '1MyAddr', value: 100000000 } }
      ],
      out: [
        { addr: '1OtherAddr', value: 99000000 },
        { addr: '1MyAddr', value: 990000 }
      ],
      fee: 10000
    })

    const result = parse_transactions({
      data: [tx],
      owner: 'testuser',
      address: '1MyAddr'
    })

    const parsed = result[0]
    parsed.transaction_type.should.equal('send')
    parsed.from_link.should.equal('/testuser/bitcoin/wallet/1MyAddr')
    parsed.from_symbol.should.equal('BTC')
    parsed.fee_amount.should.equal(0.0001)
    parsed.fee_symbol.should.equal('BTC')
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'pk123',
      address: '1ReceiverAddr'
    })

    result[0].link.should.equal('/pk123/bitcoin/wallet/1ReceiverAddr/tx/abc123def456')
  })

  it('should handle empty data', () => {
    const result = parse_transactions({
      data: [],
      owner: 'testuser',
      address: '1Addr'
    })

    result.should.have.length(0)
  })

  it('should parse transaction date correctly', () => {
    const result = parse_transactions({
      data: [make_tx({ time: 1700000000 })],
      owner: 'testuser',
      address: '1ReceiverAddr'
    })

    result[0].transaction_unix.should.equal(1700000000)
    result[0].transaction_date.should.be.a('string')
  })
})
