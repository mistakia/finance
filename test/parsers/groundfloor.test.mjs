/* global describe it */

import chai from 'chai'

import { parse_transactions } from '../../libs-server/parsers/groundfloor.mjs'

chai.should()

const make_tx = (overrides = {}) => ({
  id: 'gf-tx-001',
  createdAt: '2025-04-10T08:00:00Z',
  type: 'interest_payment',
  amount: 1250, // cents
  description: 'Interest payment for Loan #1234',
  ...overrides
})

describe('groundfloor parser', () => {
  it('should parse an interest payment as income', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'testuser'
    })

    result.should.have.length(1)
    const tx = result[0]
    tx.transaction_type.should.equal('income')
    tx.to_link.should.equal('/testuser/groundfloor/lending/default')
    tx.to_amount.should.equal(12.5)
    tx.to_symbol.should.equal('USD')
    chai.expect(tx.from_link).to.be.null
    tx.source_file.should.equal('groundfloor-api')
  })

  it('should parse a negative amount as outflow', () => {
    const result = parse_transactions({
      data: [make_tx({ amount: -5000, type: 'investment' })],
      owner: 'testuser'
    })

    const tx = result[0]
    tx.from_link.should.equal('/testuser/groundfloor/lending/default')
    tx.from_amount.should.equal(-50)
    tx.to_amount.should.equal(50)
    chai.expect(tx.to_link).to.be.null
  })

  it('should classify non-interest/payment types as transfer', () => {
    const result = parse_transactions({
      data: [make_tx({ type: 'deposit' })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('transfer')
  })

  it('should classify payment type as income', () => {
    const result = parse_transactions({
      data: [make_tx({ type: 'principal_payment' })],
      owner: 'testuser'
    })

    result[0].transaction_type.should.equal('income')
  })

  it('should convert cents to dollars', () => {
    const result = parse_transactions({
      data: [make_tx({ amount: 99 })],
      owner: 'testuser'
    })

    result[0].to_amount.should.equal(0.99)
  })

  it('should include loan info when present', () => {
    const result = parse_transactions({
      data: [make_tx({ loanId: 'loan-456', loanName: '123 Main St' })],
      owner: 'testuser'
    })

    result[0].transaction_info.loan_id.should.equal('loan-456')
    result[0].transaction_info.loan_name.should.equal('123 Main St')
  })

  it('should not include loan info when absent', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'testuser'
    })

    chai.expect(result[0].transaction_info).to.be.undefined
  })

  it('should generate correct link format', () => {
    const result = parse_transactions({
      data: [make_tx()],
      owner: 'pk123'
    })

    result[0].link.should.equal('/pk123/groundfloor/lending/default/tx/gf-tx-001')
  })

  it('should handle empty data', () => {
    parse_transactions({ data: [], owner: 'test' }).should.have.length(0)
  })
})
