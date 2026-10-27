import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '../lib/language';
import App from '../App';
import LanguageFlag from './ui/LanguageFlag';

/* ---------------------------------------------------------------
   COURSE SHELL
   ---------------------------------------------------------------
   Switching language should feel like opening a different app, so
   it literally is one: the whole app is keyed by language and
   remounts. Every page re-reads its course and its own per-language
   tables from scratch — nothing from the previous language can
   linger in some component's state.

   It then lands on Home, and a brief splash covers the swap. The
   splash is decided during render (not in an effect) so it is on
   screen in the very first frame of the new language; otherwise the
   page you switched from would flash in the new language before the
   jump home.
   --------------------------------------------------------------- */

const SPLASH_MS = 850;

function SwitchSplash({ language }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--bg-gradient)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '10px'
      }}
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        style={{
          width: '96px', height: '96px', borderRadius: '28px',
          background: '#FFFFFF', boxShadow: '0 12px 32px rgba(3, 105, 161, 0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '3rem', lineHeight: 1, marginBottom: '8px'
        }}
      >
        <LanguageFlag id={language.id} size={52} />
      </motion.div>
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.3 }}
        style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-text-navy)', letterSpacing: '-0.5px' }}
      >
        {language.nativeName}
      </motion.div>
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.14, duration: 0.3 }}
        style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}
      >
        Learning {language.name} · {language.levelSystem}
      </motion.div>
    </motion.div>
  );
}

export default function CourseShell() {
  const { languageId, language } = useLanguage();
  const navigate = useNavigate();
  const [lastId, setLastId] = useState(languageId);
  const [splashFor, setSplashFor] = useState(null);

  // Adjust state during render: the splash must exist in the same
  // commit as the remount. See the note above.
  if (lastId !== languageId) {
    setLastId(languageId);
    setSplashFor(language);
  }

  useEffect(() => {
    if (!splashFor) return undefined;
    try {
      // Scroll positions belong to the previous language's pages.
      sessionStorage.removeItem('scrollCache');
    } catch {
      // Nothing cached to clear.
    }
    navigate('/', { replace: true });
    const timer = window.setTimeout(() => setSplashFor(null), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [splashFor, navigate]);

  return (
    <>
      <App key={languageId} />
      <AnimatePresence>
        {splashFor && <SwitchSplash key={splashFor.id} language={splashFor} />}
      </AnimatePresence>
    </>
  );
}
