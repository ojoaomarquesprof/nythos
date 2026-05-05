export const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  return ('standalone' in navigator && !!(navigator as any).standalone) || 
         window.matchMedia('(display-mode: standalone)').matches;
};

export const isIOSStandalone = () => {
  return isIOS() && isStandalone();
};
