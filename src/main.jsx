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
