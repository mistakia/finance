/* global describe it */

import chai from 'chai'

import { parse_transactions, parse_token_transactions, parse_internal_transactions, parse_beacon_withdrawals } from '../../libs-server/parsers/ethereum.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  hash: '0xabc123',
  timeStamp: '1700000000',
  from: '0xsender',
  to: '0xreceiver',
  value: '1000000000000000000',
  gasUsed: '21000',
  gasPrice: '20000000000',
  ...overrides
})

const make_token_tx = (overrides = {}) => ({
  hash: '0xtoken123',
  timeStamp: '1700000000',
  from: '0xsender',
  to: '0xreceiver',
  value: '1000000',
  tokenSymbol: 'USDC',
  tokenDecimal: '6',
  logIndex: '0',
  ...overrides
})

describe('ethereum parser', () => {
  it('should parse a receive transaction', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'testuser',
      address: '0xreceiver'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('receive')
    tx.to_link.should.equal('/testuser/ethereum/wallet/0xreceiver')
    tx.to_amount.should.equal(1)
    tx.to_symbol.should.equal('ETH')
    tx.from_link.should.equal('/testuser/ethereum/external/0xsender')
    tx.source_file.should.equal('ethereum-etherscan')
  })

  it('should parse a send transaction with fees', () => {
    const result = parse_transactions({
      data: [make_tx({ from: '0xmyaddr', to: '0xother' })],
      owner: 'testuser',
      address: '0xMyAddr'
    })

    const tx = result[0]
    tx.transaction_type.should.equal('send')
    tx.from_link.should.equal('/testuser/ethereum/wallet/0xMyAddr')
    tx.fee_amount.should.be.above(0)
    tx.fee_symbol.should.equal('ETH')
  })

  it('should handle case-insensitive address matching', () => {
    const result = parse_transactions({
      data: [make_tx({ from: '0xABCDEF' })],
      owner: 'testuser',
      address: '0xabcdef'
    })

    result[0].transaction_type.should.equal('send')
  })

  it('should handle empty data', () => {
    parse_transactions({ data: [], owner: 'test', address: '0x1' }).should.have.length(0)
  })
})

describe('ethereum token parser', () => {
  it('should parse a token receive', () => {
    const result = parse_token_transactions({
      data: [make_token_tx()],
      owner: 'testuser',
      address: '0xreceiver'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('receive')
    tx.to_symbol.should.equal('USDC')
    tx.to_amount.should.equal(1)
    tx.source_file.should.equal('ethereum-etherscan-tokentx')
  })

  it('should parse a token send', () => {
    const result = parse_token_transactions({
      data: [make_token_tx({ from: '0xmyaddr' })],
      owner: 'testuser',
      address: '0xMyAddr'
    })

    result[0].transaction_type.should.equal('send')
    result[0].from_symbol.should.equal('USDC')
  })

  it('should generate unique link with logIndex', () => {
    const result = parse_token_transactions({
      data: [make_token_tx({ logIndex: '5' })],
      owner: 'testuser',
      address: '0xreceiver'
    })

    result[0].link.should.include('USDC_5')
  })
})

describe('ethereum internal transaction parser', () => {
  it('should parse an internal receive', () => {
    const result = parse_internal_transactions({
      data: [make_tx({ traceId: '0' })],
      owner: 'testuser',
      address: '0xreceiver'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('receive')
    tx.to_amount.should.equal(1)
    tx.to_symbol.should.equal('ETH')
    tx.source_file.should.equal('ethereum-etherscan-txlistinternal')
    tx.link.should.include('internal_0')
  })

  it('should parse an internal send', () => {
    const result = parse_internal_transactions({
      data: [make_tx({ from: '0xmyaddr', to: '0xother', traceId: '1' })],
      owner: 'testuser',
      address: '0xMyAddr'
    })

    result[0].transaction_type.should.equal('send')
    result[0].link.should.include('internal_1')
  })

  it('should handle empty data', () => {
    parse_internal_transactions({ data: [], owner: 'test', address: '0x1' }).should.have.length(0)
  })
})

describe('ethereum beacon withdrawal parser', () => {
  it('should parse a beacon withdrawal as staking income', () => {
    const result = parse_beacon_withdrawals({
      data: [{
        withdrawalIndex: '12345',
        validatorIndex: '100',
        timestamp: '1700000000',
        amount: '32000000000000000000'
      }],
      owner: 'testuser',
      address: '0xreceiver'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('income')
    tx.to_link.should.equal('/testuser/ethereum/wallet/0xreceiver')
    tx.to_amount.should.equal(32)
    tx.to_symbol.should.equal('ETH')
    tx.from_link.should.include('validator/100')
    tx.link.should.include('beacon_12345')
    tx.source_file.should.equal('ethereum-etherscan-beacon')
  })

  it('should handle empty data', () => {
    parse_beacon_withdrawals({ data: [], owner: 'test', address: '0x1' }).should.have.length(0)
  })
})
