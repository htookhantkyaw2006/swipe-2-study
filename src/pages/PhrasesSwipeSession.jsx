import { useSearchParams } from 'react-router-dom';
import SwipeSession from './Learn/SwipeSession';

export default function PhrasesSwipeSession() {
  const [params] = useSearchParams();
  return <SwipeSession key={params.get('level') || 'all'} isPhrases />;
}
