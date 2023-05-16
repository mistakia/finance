import React from 'react'
import PropTypes from 'prop-types'

export default function Balance({ hide_balances, amount }) {
  if (hide_balances) {
    return <div className='balance__box' style={{ width: 80, height: 16 }} />
  }

  return amount
}

Balance.propTypes = {
  hide_balances: PropTypes.bool,
  amount: PropTypes.string
}
