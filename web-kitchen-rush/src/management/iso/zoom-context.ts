import { createContext } from 'react';

/** Lets a scene zoom by a factor (pinch, mouse wheel); the game shell owns the zoom level and its limits. */
export const ZoomContext = createContext<((factor: number) => void) | null>(null);
