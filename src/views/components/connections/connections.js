import React from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { styled } from '@mui/material/styles'
import PropTypes from 'prop-types'
import IconButton from '@mui/material/IconButton'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import Collapse from '@mui/material/Collapse'
import Badge from '@mui/material/Badge'

import Connection from '@components/connection'
import ConnectionModal from '@components/connection-modal'

import './connections.styl'

const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#44b700',
    color: '#44b700',
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    '&::after': {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      animation: 'ripple 1.2s infinite ease-in-out',
      border: '1px solid currentColor',
      content: '""'
    }
  },
  '@keyframes ripple': {
    '0%': {
      transform: 'scale(.8)',
      opacity: 1
    },
    '100%': {
      transform: 'scale(2.4)',
      opacity: 0
    }
  }
}))

export default function Connections({ connections }) {
  const [is_open, set_open] = React.useState(false)
  const items = []
  for (const [key, value] of connections.toSeq()) {
    items.push(<Connection key={key} connection={value} />)
  }

  return (
    <div className='connections'>
      <div className='row'>
        <div className='cell connections_expand'>
          <IconButton size='small' onClick={() => set_open(!is_open)}>
            {is_open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </div>
        <div className='cell'>
          <StyledBadge color='secondary' badgeContent=' ' variant='dot'>
            {connections.size} Connections
          </StyledBadge>
        </div>
        <div className='cell connections_add'>
          <ConnectionModal />
        </div>
      </div>
      <Collapse in={is_open} timeout='auto' unmountOnExit>
        <div className='row head'>
          <div className='cell connection_menu' />
          <div className='cell'>Account</div>
          <div className='cell connection_type'>Type</div>
          <div className='cell connection_time'>Last Connection</div>
        </div>
        {items}
      </Collapse>
    </div>
  )
}

Connections.propTypes = {
  connections: ImmutablePropTypes.map,
  rows: PropTypes.array
}
