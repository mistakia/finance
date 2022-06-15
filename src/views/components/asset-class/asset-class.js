import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Collapse from '@mui/material/Collapse'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import Table from '@mui/material/Table'
import TableContainer from '@mui/material/TableContainer'

import Asset from '@components/asset'

export default function AssetClass(props) {
  const [open, setOpen] = React.useState(false)
  const { summary, assets } = props
  const rows = []

  assets.forEach((asset, index) => {
    rows.push(<Asset asset={asset} key={index} />)
  })

  return (
    <>
      <Asset
        asset={summary}
        key={summary.symbol}
        setOpen={setOpen}
        open={open}
      />
      <TableRow>
        <TableCell style={{ padding: 0 }} colSpan={4}>
          <Collapse in={open} timeout='auto' unmountOnExit>
            <TableContainer>
              <Table sx={{ minWidth: 750 }} size='small'>
                <TableBody>{rows}</TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

AssetClass.propTypes = {
  summary: PropTypes.object,
  assets: ImmutablePropTypes.map
}
