/* global describe it */

import chai from 'chai'

import { get_option_symbol } from '#libs-server'
import { constants } from '#trading'

chai.should()

describe('get_option_symbol', () => {
  it('should return the correct call option symbol', () => {
    get_option_symbol({
      underlying_symbol: 'SPY',
      expire_date: '2021-01-15',
      strike: 400,
      option_type: constants.OPTION_TYPE.CALL
    }).should.equal('SPY210115C00400000')
  })

  it('should return the correct option symbol with strike price with cents', () => {
    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 150.5,
      option_type: constants.OPTION_TYPE.CALL
    }).should.equal('AAPL251219C00150500')

    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 150.05,
      option_type: constants.OPTION_TYPE.CALL
    }).should.equal('AAPL251219C00150050')

    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 150.005,
      option_type: constants.OPTION_TYPE.CALL
    }).should.equal('AAPL251219C00150000')
  })

  it('should return the correct option symbol with strike price with 4 digit dollars and cents', () => {
    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 1000.01,
      option_type: constants.OPTION_TYPE.CALL
    }).should.equal('AAPL251219C01000010')
  })

  it('should return the correct put option symbol', () => {
    get_option_symbol({
      underlying_symbol: 'SPY',
      expire_date: '2021-01-15',
      strike: 400,
      option_type: constants.OPTION_TYPE.PUT
    }).should.equal('SPY210115P00400000')

    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 150,
      option_type: constants.OPTION_TYPE.PUT
    }).should.equal('AAPL251219P00150000')

    get_option_symbol({
      underlying_symbol: 'AAPL',
      expire_date: '2025-12-19',
      strike: 150.5,
      option_type: constants.OPTION_TYPE.PUT
    }).should.equal('AAPL251219P00150500')
  })
})
