import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { seedDB } from './lib/seed.js'
import { LanguageProvider } from './lib/language.jsx'
import { PreferencesProvider } from './lib/preferences.jsx'

seedDB();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PreferencesProvider>
      <LanguageProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </PreferencesProvider>
  </React.StrictMode>,
)
