import AppErrorBoundary from '@/components/AppErrorBoundary';
import TopBar from '@/components/TopBar';
import ImageViewport from '@/components/ImageViewport';
import Sidebar from '@/components/Sidebar';
import CamerasPage from '@/components/CamerasPage';
import CameraMapSelector from '@/components/CameraMapSelector';
import ZoneMapSelector from '@/components/ZoneMapSelector';
import { useStore } from '@/store/useStore';
import AdminShell from '@/layout/AdminShell';
import AccessStatePage from '@/pages/AccessStatePage';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import PartnersAdminPage from '@/pages/PartnersAdminPage';
import PasswordResetPage from '@/pages/PasswordResetPage';
import ProfilePage from '@/pages/ProfilePage';
import SourcesPage from '@/pages/SourcesPage';
import UsersAdminPage from '@/pages/UsersAdminPage';
import ZonesAdminPage from '@/pages/ZonesAdminPage';
import { AppRoute, useHashRoute } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';
import { api, apiConfig } from '@/api/client';
import { ApiRequestError } from '@/api/http';
import { useEffect, useRef } from 'react';
import type { ViewMode } from '@/types';
import { navigate } from '@/router/routes';
import GlobalFeedbackHost from '@/feedback/GlobalFeedbackHost';

const routePermissions: Partial<Record<AppRoute, string[]>> = {
  cameras: ['cameras.view'],
  zones: ['zones.view'],
  sources: ['sources.view'],
  users: ['admin.users.view', 'partner_members.view'],
  partners: ['admin.partners.view']
};

export default function App() {
  const route = useHashRoute();
  const sessionUser = useSessionStore(state => state.user);
  const sessionAccessToken = useSessionStore(state => state.accessToken);
  const sessionValidating = useSessionStore(state => state.validating);
  const sessionHasPermission = useSessionStore(state => state.hasPermission);
  const sessionLogout = useSessionStore(state => state.logout);
  const sessionSetSession = useSessionStore(state => state.setSession);
  const sessionSetValidating = useSessionStore(state => state.setValidating);
  const viewMode = useStore(state => state.viewMode);
  const apiBase = useStore(state => state.apiBase);
  const token = useStore(state => state.token);
  const setViewMode = useStore(state => state.setViewMode);
  const validatedTokenRef = useRef<string | undefined>(undefined);
  const effectiveToken = sessionAccessToken || token;
  const shouldValidateSession = Boolean(
    sessionAccessToken
    && sessionUser
    && validatedTokenRef.current !== sessionAccessToken
  );

  apiConfig.set(apiBase, effectiveToken);

  useEffect(() => {
    apiConfig.set(apiBase, effectiveToken);
  }, [apiBase, effectiveToken]);

  useEffect(() => {
    apiConfig.setUnauthorizedHandler(() => {
      sessionLogout();
      navigate('login');
    });
    return () => apiConfig.setUnauthorizedHandler(undefined);
  }, [sessionLogout]);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      if (!sessionAccessToken || !sessionUser) {
        validatedTokenRef.current = sessionAccessToken;
        return;
      }
      if (validatedTokenRef.current === sessionAccessToken) return;

      sessionSetValidating(true);
      try {
        const profile = await api.auth.me();
        if (cancelled) return;
        validatedTokenRef.current = sessionAccessToken;
        sessionSetSession({
          accessToken: sessionAccessToken,
          user: {
            ...profile,
            permissions: profile.permissions ?? [],
            partner_memberships: profile.partner_memberships ?? []
          }
        });
      } catch (error: any) {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          validatedTokenRef.current = undefined;
          sessionLogout();
          navigate('login');
          return;
        }
        validatedTokenRef.current = sessionAccessToken;
      } finally {
        if (!cancelled) {
          sessionSetValidating(false);
        }
      }
    }

    validateSession();
    return () => {
      cancelled = true;
    };
  }, [apiBase, sessionAccessToken, sessionUser, sessionLogout, sessionSetSession, sessionSetValidating]);

  useEffect(() => {
    if ((route === 'login' || route === 'register') && sessionUser) {
      navigate('dashboard');
    }
  }, [route, sessionUser]);

  useEffect(() => {
    if (route === 'labeler' && viewMode === 'cameras') {
      setViewMode('labeler');
    }
  }, [route, viewMode, setViewMode]);

  useEffect(() => {
    if (route === 'labeler' && !useStore.getState().cameraId) {
      navigate('cameras');
    }
  }, [route]);

  let content: React.ReactNode;

  if (route === 'login' || route === 'register' || route === 'password-reset') {
    content = (
      <AppErrorBoundary>
        {route === 'password-reset' ? <PasswordResetPage /> : <AuthPage mode={route} />}
      </AppErrorBoundary>
    );
  } else if (sessionValidating || shouldValidateSession) {
    content = (
      <AccessStatePage
        title="Проверяем сессию"
        subtitle="Подтягиваем профиль и права доступа из API."
        actionLabel="Ко входу"
        actionRoute="login"
      />
    );
  } else if (!sessionUser) {
    content = (
      <AppErrorBoundary>
        <AuthPage mode="login" />
      </AppErrorBoundary>
    );
  } else {
    const requiredPermissions = routePermissions[route];
    if (requiredPermissions && !requiredPermissions.some(permission => sessionHasPermission(permission))) {
      content = (
        <AdminShell route={route}>
          <AccessStatePage
            title="Доступ ограничен"
            subtitle="Для этого раздела у текущей сессии недостаточно прав."
            actionLabel="Открыть профиль"
            actionRoute="profile"
          />
        </AdminShell>
      );
    } else {
      content = (
        <AdminShell route={route}>
          <AppErrorBoundary>
            {renderRoute(route, viewMode)}
          </AppErrorBoundary>
        </AdminShell>
      );
    }
  }

  return (
    <>
      {content}
      <GlobalFeedbackHost />
    </>
  );
}

function renderRoute(route: AppRoute, viewMode: ViewMode) {
  if (route === 'dashboard') return <DashboardPage />;
  if (route === 'profile') return <ProfilePage />;
  if (route === 'users') return <UsersAdminPage />;
  if (route === 'partners') return <PartnersAdminPage />;
  if (route === 'zones') return <ZonesAdminPage />;
  if (route === 'sources') return <SourcesPage />;
  if (route === 'cameras') {
    return (
      <div className="legacy-map-grid">
        <CamerasPage />
      </div>
    );
  }
  if (route === 'labeler') {
    if (viewMode === 'cameraMapSelector') {
      return (
        <div className="legacy-map-grid">
          <CameraMapSelector />
        </div>
      );
    }
    if (viewMode === 'zoneMapSelector') {
      return (
        <div className="legacy-map-grid">
          <ZoneMapSelector />
        </div>
      );
    }

    return (
      <div className="legacy-labeler-grid">
        <TopBar />
        <Sidebar />
        <ImageViewport />
      </div>
    );
  }

  return <DashboardPage />;
}
