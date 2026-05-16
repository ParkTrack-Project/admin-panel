import { useEffect, useState } from 'react';

export const appRoutes = [
  'dashboard',
  'profile',
  'users',
  'partners',
  'cameras',
  'zones',
  'sources',
  'labeler',
  'login',
  'register',
  'password-reset'
] as const;

export type AppRoute = typeof appRoutes[number];

const routeSet = new Set<string>(appRoutes);

export function routeFromHash(hash = window.location.hash): AppRoute {
  const raw = hash.replace(/^#\/?/, '').split('?')[0].trim();
  if (!raw) return 'dashboard';
  return routeSet.has(raw) ? raw as AppRoute : 'dashboard';
}

export function navigate(route: AppRoute) {
  window.location.hash = route === 'dashboard' ? '#/' : `#/${route}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
