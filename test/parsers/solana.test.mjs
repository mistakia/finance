/* global describe it */

import chai from 'chai'

import {
  parse_transactions,
  parse_staking_rewards
} from '../../libs-server/parsers/solana.mjs'

chai.should()

const ADDR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
const OTHER = '9yNtYrhPqoF5pQJV3Y2qYPBJhN8xhGgwYJXRG1s3FcV2'

const make_transfer_tx = (overrides = {}) => ({
  signature: 'sig123abc',
  timestamp: 1700000000,
  type: 'TRANSFER',
  fee: 5000,
  nativeTransfers: [
    {
      fromUserAccount: ADDR,
      toUserAccount: OTHER,
      amount: 1000000000
    }
  ],
  tokenTransfers: [],
  ...overrides
})

describe('solana transaction parser', () => {
  it('should parse a native SOL send', () => {
    const result = parse_transactions({
      data: [make_transfer_tx()],
      owner: 'testuser',
      address: ADDR
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.from_link.should.equal(`/testuser/solana/wallet/${ADDR}`)
    tx.from_amount.should.equal(-1)
    tx.from_symbol.should.equal('SOL')
    chai.expect(tx.to_link).to.be.null
    tx.to_amount.should.equal(1)
    tx.fee_amount.should.equal(0.000005)
    tx.description.should.include('Send')
  })

  it('should parse a native SOL receive', () => {
    const result = parse_transactions({
      data: [
        make_transfer_tx({
          nativeTransfers: [
            { fromUserAccount: OTHER, toUserAccount: ADDR, amount: 500000000 }
          ]
        })
      ],
      owner: 'testuser',
      address: ADDR
    })

    const tx = result[0]
    tx.transaction_type.should.equal('transfer')
    tx.to_link.should.equal(`/testuser/solana/wallet/${ADDR}`)
    tx.to_amount.should.equal(0.5)
    chai.expect(tx.from_link).to.be.null
    tx.description.should.include('Receive')
  })

  it('should parse an SPL token transfer', () => {
    const result = parse_transactions({
      data: [
        {
          signature: 'sig456',
          timestamp: 1700000000,
          type: 'TRANSFER',
          fee: 5000,
          nativeTransfers: [],
          tokenTransfers: [
            {
              fromUserAccount: OTHER,
              toUserAccount: ADDR,
              tokenAmount: 100.5,
              mint: 'USDC'
            }
          ]
        }
      ],
      owner: 'testuser',
      address: ADDR
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.to_link.should.equal(`/testuser/solana/wallet/${ADDR}/USDC`)
    tx.to_amount.should.equal(100.5)
    tx.to_symbol.should.equal('USDC')
  })

  it('should parse a SWAP transaction', () => {
    const result = parse_transactions({
      data: [
        {
          signature: 'sigswap',
          timestamp: 1700000000,
          type: 'SWAP',
          fee: 5000,
          nativeTransfers: [],
          tokenTransfers: [],
          events: {
            swap: {
              nativeInput: { account: ADDR, amount: 2000000000 },
              nativeOutput: null,
              tokenInputs: [],
              tokenOutputs: [
                {
                  tokenAccount: 'acc1',
                  mint: 'BONK',
                  rawTokenAmount: { tokenAmount: '1000000' }
                }
              ]
            }
          }
        }
      ],
      owner: 'testuser',
      address: ADDR
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('exchange')
    tx.from_symbol.should.equal('SOL')
    tx.from_amount.should.equal(-2)
    tx.to_symbol.should.equal('BONK')
    tx.to_amount.should.equal(1000000)
  })

  it('should skip transfers not involving the address', () => {
    const result = parse_transactions({
      data: [
        make_transfer_tx({
          nativeTransfers: [
            { fromUserAccount: 'aaa', toUserAccount: 'bbb', amount: 100000 }
          ]
        })
      ],
      owner: 'testuser',
      address: ADDR
    })

    result.should.have.length(0)
  })

  it('should handle empty data', () => {
    parse_transactions({
      data: [],
      owner: 'test',
      address: ADDR
    }).should.have.length(0)
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: [make_transfer_tx({ signature: 'mysig' })],
      owner: 'pk123',
      address: ADDR
    })

    result[0].link.should.include('/pk123/solana/wallet/')
    result[0].link.should.include('/tx/mysig/')
  })
})

describe('solana staking rewards parser', () => {
  it('should parse a staking reward', () => {
    const result = parse_staking_rewards({
      data: [
        {
          epoch: 500,
          amount: 50000000,
          effectiveSlot: 216000000
        }
      ],
      owner: 'testuser',
      address: 'stakeAddr1'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('income')
    tx.to_amount.should.equal(0.05)
    tx.to_symbol.should.equal('SOL')
    tx.link.should.equal('/testuser/solana/staking/stakeAddr1/epoch/500')
    tx.description.should.include('epoch 500')
  })

  it('should skip zero-amount rewards', () => {
    const result = parse_staking_rewards({
      data: [{ epoch: 501, amount: 0 }],
      owner: 'testuser',
      address: 'stakeAddr1'
    })

    result.should.have.length(0)
  })

  it('should handle empty data', () => {
    parse_staking_rewards({
      data: [],
      owner: 'test',
      address: 'addr'
    }).should.have.length(0)
  })

  it('should convert lamports correctly', () => {
    const result = parse_staking_rewards({
      data: [{ epoch: 502, amount: 1000000000, effectiveSlot: 100 }],
      owner: 'testuser',
      address: 'stakeAddr1'
    })

    result[0].to_amount.should.equal(1)
  })
})
