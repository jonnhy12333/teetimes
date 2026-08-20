import { createSignal, onMount, Show } from 'solid-js'
import './App.css'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

const apiBaseUrl = import.meta.env.VITE_API_URL || ''

function App() {
  const [user, setUser] = createSignal<{ email: string; name: string } | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)

  onMount(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/user/profile`, {
        credentials: 'include',
      })

      if (response.ok) {
        setUser(await response.json())
      }
    } catch (error) {
      console.error('Failed to load user profile', error)
    } finally {
      setIsLoading(false)
    }
  })

  return (
    <Show when={!isLoading()} fallback={<div class="loading full-page">Loading tee times...</div>}>
      <Show
        when={user()}
        fallback={<Login onLogin={setUser} />}
      >
        <Dashboard user={user()!} />
      </Show>
    </Show>
  )
}

export default App
