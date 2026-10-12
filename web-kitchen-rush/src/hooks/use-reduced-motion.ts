import { useMemo } from 'react';

/** Read .matches inside useFrame so live OS changes never wait on a React commit. */
export function useReducedMotionQuery(): MediaQueryList {
  return useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), []);
}
