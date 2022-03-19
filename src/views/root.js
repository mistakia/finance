import React from 'react'
import { create } from 'jss'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import {
  createTheme,
  createGenerateClassName,
  StylesProvider,
  ThemeProvider,
  jssPreset
} from '@material-ui/core/styles'

import { store, history } from '@core/store.js'
import App from '@components/app/index.js'

const theme = createTheme()
const jss = create({ plugins: [...jssPreset().plugins] })
const generateClassName = createGenerateClassName({
  productionPrefix: navigator.userAgent === 'ReactSnap' ? 'snap' : 'jss'
})

const Root = () => (
  <Provider store={store}>
    <StylesProvider jss={jss} generateClassName={generateClassName}>
      <ThemeProvider theme={theme}>
        <Router history={history}>
          <App />
        </Router>
      </ThemeProvider>
    </StylesProvider>
  </Provider>
)

export default Root
