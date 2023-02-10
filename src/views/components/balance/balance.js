import React from 'react'
import PropTypes from 'prop-types'

import './balance.styl'

export default function Balance({ hide_balances, amount }) {
  const comma_count = (amount.match(/,/g) || []).length

  if (hide_balances) {
    return (
      <>
        {comma_count > 1 && (
          <>
            <span className='hidden_balance' />
            <span className='hidden_balance' />
            <span className='hidden_balance' />
            <span>,</span>
          </>
        )}
        <span className='hidden_balance' />
        <span className='hidden_balance' />
        <span className='hidden_balance' />
        <span>,</span>
        <span className='hidden_balance' />
        <span className='hidden_balance' />
        <span className='hidden_balance' />
        <span>.</span>
        <span className='hidden_balance' />
        <span className='hidden_balance' />
      </>
    )
  }

  return amount
}

Balance.propTypes = {
  hide_balances: PropTypes.bool,
  amount: PropTypes.string
}
