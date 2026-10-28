import './CourseShell.css';
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
    <motion.div className="course-shell-layout-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}

      aria-live="polite"
    >
      <motion.div className="course-shell-panel-1"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}

      >
        <LanguageFlag id={language.id} size={52} />
      </motion.div>
      <motion.div className="course-shell-layout-2"
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.3 }}

      >
        {language.nativeName}
      </motion.div>
      <motion.div className="course-shell-layout-3"
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.14, duration: 0.3 }}

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
