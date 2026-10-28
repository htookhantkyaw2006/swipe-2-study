import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import CourseShell from './components/CourseShell.jsx'
import './index.css'
import { migrateStorage } from './lib/migrate.js'
import { seedDB } from './lib/seed.js'
import { LanguageProvider } from './lib/language.jsx'
import { PreferencesProvider } from './lib/preferences.jsx'
import StorageOwnerBoundary from './components/StorageOwnerBoundary.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { recoveryLink } from './lib/recoveryLink.js'
import './responsive-tools.css'

// Capture and scrub custom recovery links before Auth or Router initialization.
recoveryLink.capture(window.location.href, path => window.history.replaceState(window.history.state, '', path));

// Order matters: move pre-language data into its per-language tables
// before anything reads them, then make sure the active course has
// its starter vocabulary.
migrateStorage();
seedDB();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <StorageOwnerBoundary>
        <PreferencesProvider>
          <LanguageProvider>
            <BrowserRouter>
              <CourseShell />
            </BrowserRouter>
          </LanguageProvider>
        </PreferencesProvider>
      </StorageOwnerBoundary>
    </AuthProvider>
  </React.StrictMode>,
)
