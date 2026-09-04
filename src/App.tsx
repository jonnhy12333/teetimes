import './App.css'
import { Drawer } from '@ark-ui/solid/drawer'
import Dashboard from './components/Dashboard'

function App() {
  return <Drawer.Stack>
    <Drawer.Indent class="app-drawer-indent">
      <Dashboard />
    </Drawer.Indent>
  </Drawer.Stack>
}

export default App
