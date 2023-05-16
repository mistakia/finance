import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import BigNumber from 'bignumber.js'
import IconButton from '@mui/material/IconButton'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import Collapse from '@mui/material/Collapse'

import Balance from '@components/balance'
import Holding from '@components/holding'

import './asset.styl'

function Holdings({ holdings, asset }) {
  const rows = []

  holdings
    .sort((a, b) => b.quantity - a.quantity)
    .forEach((holding, index) => {
      rows.push(<Holding holding={holding} key={index} asset={asset} />)
    })

  return <>{rows}</>
}

Holdings.propTypes = {
  holdings: ImmutablePropTypes.list,
  asset: ImmutablePropTypes.record
}

export default function Asset({
  asset,
  total_balance,
  asset_class_open,
  set_asset_class_open
}) {
  const [holdings_open, set_holdings_open] = React.useState(false)
  const allocation = asset.balance / total_balance

  const set_open = set_asset_class_open || set_holdings_open
  const is_open = set_asset_class_open ? asset_class_open : holdings_open
  return (
    <>
      <div className='asset' tabIndex={-1} key={asset.link}>
        <div className='row'>
          <div className='cell asset_expand'>
            <IconButton size='small' onClick={() => set_open(!is_open)}>
              {is_open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </div>
          <div className='cell'>{asset.symbol}</div>
          <div className='cell asset_quantity metric' style={{ width: 120 }}>
            {asset.quantity && (
              <Balance amount={BigNumber(asset.quantity).toFormat(2)} />
            )}
          </div>
          <div className='cell asset_balance metric' style={{ width: 120 }}>
            <Balance amount={BigNumber(asset.balance).toFormat(2)} />
          </div>
          <div className='cell asset_allocation metric' style={{ width: 70 }}>
            {BigNumber(allocation * 100).toFormat(2)}%
          </div>
        </div>
        <Collapse in={holdings_open} timeout='auto' unmountOnExit>
          <Holdings holdings={asset.holdings} asset={asset} />
        </Collapse>
      </div>
    </>
  )
}

Asset.propTypes = {
  asset: ImmutablePropTypes.record,
  total_balance: PropTypes.number,
  asset_class_open: PropTypes.bool,
  set_asset_class_open: PropTypes.func
}
