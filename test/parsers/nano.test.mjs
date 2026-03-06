/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/nano.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  hash: 'ABC123BLOCK',
  type: 'receive',
  account: 'nano_3counterparty',
  amount: '1000000000000000000000000000000',
  local_timestamp: '1700000000',
  ...overrides
})

describe('nano parser', () => {
  it('should parse a receive transaction', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'testuser',
      address: 'nano_3myaddr'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('receive')
    tx.to_link.should.equal('/testuser/nano/wallet/nano_3myaddr')
    tx.to_symbol.should.equal('XNO')
    tx.from_link.should.equal('/testuser/nano/external/nano_3counterparty')
    tx.tx_id.should.equal('ABC123BLOCK')
    tx.source_file.should.equal('nano-rpc')
  })

  it('should parse a send transaction', () => {
    const result = parse_transactions({
      data: [make_tx({ type: 'send' })],
      owner: 'testuser',
      address: 'nano_3myaddr'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('send')
    tx.from_link.should.equal('/testuser/nano/wallet/nano_3myaddr')
    tx.to_link.should.equal('/testuser/nano/external/nano_3counterparty')
  })

  it('should convert raw amount to XNO', () => {
    const result = parse_transactions({
      data: [make_tx({ amount: '1000000000000000000000000000000' })],
      owner: 'testuser',
      address: 'nano_3myaddr'
    })

    result[0].to_amount.should.equal(1)
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'pk123',
      address: 'nano_3myaddr'
    })

    result[0].link.should.equal('/pk123/nano/wallet/nano_3myaddr/tx/ABC123BLOCK')
  })

  it('should handle empty data', () => {
    parse_transactions({ data: [], owner: 'test', address: 'nano_1' }).should.have.length(0)
  })
})
