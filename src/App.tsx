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
import ProfilePage from '@/pages/ProfilePage';
import SourcesPage from '@/pages/SourcesPage';
import UsersAdminPage from '@/pages/UsersAdminPage';
import ZonesAdminPage from '@/pages/ZonesAdminPage';
import { AppRoute, useHashRoute } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';
import { api, apiConfig } from '@/api/client';
import { useEffect, useRef } from 'react';
import type { ViewMode } from '@/types';
import { navigate } from '@/router/routes';

const routePermissions: Partial<Record<AppRoute, string>> = {
  cameras: 'cameras.view',
  zones: 'zones.view',
  sources: 'sources.view',
  users: 'admin.users.view',
  partners: 'admin.partners.view'
};

export default function App() {
  const route = useHashRoute();
  const session = useSessionStore();
  const { viewMode, apiBase, token, setViewMode } = useStore();
  const validatedTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    apiConfig.set(apiBase, session.accessToken || token);
  }, [apiBase, session.accessToken, token]);

  useEffect(() => {
    apiConfig.setUnauthorizedHandler(() => {
      session.logout();
      navigate('login');
    });
    return () => apiConfig.setUnauthorizedHandler(undefined);
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      if (!session.accessToken || !session.user || session.accessToken === 'dev-admin-token') {
        validatedTokenRef.current = session.accessToken;
        return;
      }
      if (validatedTokenRef.current === session.accessToken) return;

      session.setValidating(true);
      try {
        const profile = await api.auth.me();
        if (cancelled) return;
        validatedTokenRef.current = session.accessToken;
        session.setSession({
          accessToken: session.accessToken,
          user: {
            ...profile,
            permissions: profile.permissions ?? [],
            partner_memberships: profile.partner_memberships ?? []
          }
        });
      } catch (error: any) {
        if (cancelled) return;
        validatedTokenRef.current = undefined;
        session.logout();
        navigate('login');
      } finally {
        if (!cancelled) {
          session.setValidating(false);
        }
      }
    }

    validateSession();
    return () => {
      cancelled = true;
    };
  }, [apiBase, session.accessToken, session.user, session.logout, session.setSession, session.setValidating]);

  useEffect(() => {
    if (route === 'cameras' && viewMode !== 'cameras') {
      setViewMode('cameras');
    }
    if (route === 'labeler' && viewMode === 'cameras') {
      setViewMode('labeler');
    }
  }, [route, viewMode, setViewMode]);

  useEffect(() => {
    if (route === 'labeler' && !useStore.getState().cameraId) {
      navigate('cameras');
    }
  }, [route]);

  if (route === 'login' || route === 'register') {
    if (session.user) {
      navigate('dashboard');
      return null;
    }
    return <AuthPage mode={route} />;
  }

  if (session.validating) {
    return (
      <AccessStatePage
        title="Проверяем сессию"
        subtitle="Подтягиваем профиль и права доступа из API."
        actionLabel="Ко входу"
        actionRoute="login"
      />
    );
  }

  if (!session.user) {
    return <AuthPage mode="login" />;
  }

  const requiredPermission = routePermissions[route];
  if (requiredPermission && !session.hasPermission(requiredPermission)) {
    return (
      <AdminShell route={route}>
        <AccessStatePage
          title="Доступ ограничен"
          subtitle="Для этого раздела у текущей сессии недостаточно прав."
          actionLabel="Открыть профиль"
          actionRoute="profile"
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell route={route}>
      {renderRoute(route, viewMode)}
    </AdminShell>
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
