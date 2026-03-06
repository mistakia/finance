/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/zcash.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  hash: 'zec_tx_abc123',
  time: 1700000000,
  balance_change: 50000000,
  fee: 10000,
  ...overrides
})

describe('zcash parser', () => {
  it('should parse a receive transaction', () => {
    const result = parse_transactions({
      data: [make_tx({ balance_change: 50000000 })],
      owner: 'testuser',
      address: 't1ZcashAddr'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('receive')
    tx.to_link.should.equal('/testuser/zcash/wallet/t1ZcashAddr')
    tx.to_amount.should.equal(0.5)
    tx.to_symbol.should.equal('ZEC')
    tx.tx_id.should.equal('zec_tx_abc123')
    tx.source_file.should.equal('zcash-blockchair')
    chai.expect(tx.fee_amount).to.be.undefined
  })

  it('should parse a send transaction with fee', () => {
    const result = parse_transactions({
      data: [make_tx({ balance_change: -100000000, fee: 10000 })],
      owner: 'testuser',
      address: 't1ZcashAddr'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('send')
    tx.from_link.should.equal('/testuser/zcash/wallet/t1ZcashAddr')
    tx.from_amount.should.equal(-1)
    tx.from_symbol.should.equal('ZEC')
    tx.fee_amount.should.equal(0.0001)
    tx.fee_symbol.should.equal('ZEC')
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'pk123',
      address: 't1Addr'
    })

    result[0].link.should.equal('/pk123/zcash/wallet/t1Addr/tx/zec_tx_abc123')
  })

  it('should handle empty data', () => {
    parse_transactions({ data: [], owner: 'test', address: 't1' }).should.have.length(0)
  })

  it('should use block_time as fallback', () => {
    const result = parse_transactions({
      data: [make_tx({ time: undefined, block_time: 1700000000 })],
      owner: 'testuser',
      address: 't1Addr'
    })

    result[0].transaction_unix.should.equal(1700000000)
  })
})
