// Hash routes, so the app works from any folder on GitHub Pages and offline:
//   #/            characters
//   #/new         new character
//   #/about       this device and credits
//   #/c/<id>/<tab> a character sheet

import { useEffect, useState } from 'react';

function read(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function go(path: string) {
  window.location.hash = path;
}
