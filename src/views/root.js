import React from 'react'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { createTheme, ThemeProvider } from '@mui/material/styles'

import { store, history } from '@core/store.js'
import storeRegistry from '@core/store-registry'
import App from '@components/app/index.js'

storeRegistry.register(store)

const theme = createTheme({
  palette: {
    primary: {
      main: '#000000'
    },
    secondary: {
      main: '#FF0000'
    }
  }
})

const Root = () => (
  <Provider store={store}>
    <Router history={history}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </Router>
  </Provider>
)

export default Root
