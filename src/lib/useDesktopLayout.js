import { useSyncExternalStore } from 'react';

const query = '(min-width: 1024px)';
const getSnapshot = () => window.matchMedia(query).matches;
const subscribe = notify => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
export const useDesktopLayout = () => useSyncExternalStore(subscribe, getSnapshot, () => false);
