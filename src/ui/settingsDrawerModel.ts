export interface DrawerPresentation {
  transform: 'translateX(0)' | 'translateX(100%)';
  visibility: 'visible' | 'hidden';
  pointerEvents: 'auto' | 'none';
}

/** Stable presentation state shared by drawer and backdrop. */
export function getDrawerPresentation(isOpen: boolean): DrawerPresentation {
  return isOpen
    ? { transform: 'translateX(0)', visibility: 'visible', pointerEvents: 'auto' }
    : { transform: 'translateX(100%)', visibility: 'hidden', pointerEvents: 'none' };
}
