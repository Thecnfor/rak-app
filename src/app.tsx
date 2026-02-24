import { Component, PropsWithChildren } from 'react'
import { Provider } from 'mobx-react'
import store from './store'

import './app.css'

class App extends Component<PropsWithChildren> {
  componentDidMount () {}
  componentDidShow () {}
  componentDidHide () {}

  render () {
    return (
      <Provider store={store}>
        {this.props.children}
      </Provider>
    )
  }
}

export default App
