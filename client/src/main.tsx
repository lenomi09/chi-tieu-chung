import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { AppStateProvider } from '@/context/AppStateContext'
import { ThemeProvider } from '@/context/ThemeContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfirmProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </ConfirmProvider>
    </ThemeProvider>
  </StrictMode>
)
