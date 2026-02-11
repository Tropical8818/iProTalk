import { useState, useEffect } from 'react'
import { Auth } from './components/Auth'
import { Chat } from './components/Chat'
import './App.css'

function App() {
  const [user, setUser] = useState<{ token: string; id: string; name: string } | null>(() => {
    const token = localStorage.getItem('token')
    const id = localStorage.getItem('user_id')
    const name = localStorage.getItem('user_name')
    return token && id && name ? { token, id, name } : null
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem('token', user.token)
      localStorage.setItem('user_id', user.id)
      localStorage.setItem('user_name', user.name)
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user_id')
      localStorage.removeItem('user_name')
    }
  }, [user])

  const handleAuthSuccess = (data: { token: string; user_id: string; name: string }) => {
    setUser({ token: data.token, id: data.user_id, name: data.name })
  }

  const handleLogout = () => {
    setUser(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {!user ? (
        <div className="flex-1 flex items-center justify-center bg-radial-at-t from-slate-900 to-slate-950">
          <Auth onSuccess={handleAuthSuccess} />
        </div>
      ) : (
        <Chat user={user} onLogout={handleLogout} />
      )}
    </div>
  )
}

export default App
