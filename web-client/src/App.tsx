import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { RootState } from './store'
import { Auth } from './components/Auth'
import { Chat } from './components/Chat'
import E2EESetup from './components/E2EESetup'
import './App.css'

function App() {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth)

  return (
    <div className="min-h-screen bg-slate-950 w-full flex flex-col">
      <Routes>
        <Route
          path="/auth"
          element={!isAuthenticated ? (
            <div className="flex-1 flex items-center justify-center bg-radial-at-t from-slate-900 to-slate-950">
              <Auth />
            </div>
          ) : (
            <Navigate to="/" replace />
          )}
        />

        <Route
          path="/setup"
          element={isAuthenticated ? <div className="flex-1 w-full"><E2EESetup /></div> : <Navigate to="/auth" replace />}
        />

        <Route
          path="/"
          element={
            !isAuthenticated ? (
              <Navigate to="/auth" replace />
            ) : (
              <Chat />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
