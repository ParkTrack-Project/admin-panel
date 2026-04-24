import TopBar from '@/components/TopBar';
import ImageViewport from '@/components/ImageViewport';
import Sidebar from '@/components/Sidebar';
import CamerasPage from '@/components/CamerasPage';
import CameraMapSelector from '@/components/CameraMapSelector';
import ZoneMapSelector from '@/components/ZoneMapSelector';
import { useStore } from '@/store/useStore';
import AdminShell from '@/layout/AdminShell';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import ResourcePlaceholderPage from '@/pages/ResourcePlaceholderPage';
import SourcesPage from '@/pages/SourcesPage';
import ZonesAdminPage from '@/pages/ZonesAdminPage';
import { AppRoute, useHashRoute } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';
import { apiConfig } from '@/api/client';
import { useEffect } from 'react';
import type { ViewMode } from '@/types';
import { navigate } from '@/router/routes';

export default function App() {
  const route = useHashRoute();
  const session = useSessionStore();
  const { viewMode, apiBase, token, setViewMode } = useStore();

  useEffect(() => {
    apiConfig.set(apiBase, session.accessToken || token);
  }, [apiBase, session.accessToken, token]);

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
    return <AuthPage mode={route} />;
  }

  if (!session.user) {
    return <AuthPage mode="login" />;
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
  if (route === 'users') {
    return (
      <ResourcePlaceholderPage
        title="Пользователи"
        subtitle="Учётные записи, роли и статусы"
        endpoints={['GET /users', 'GET /users/<user_id>', 'POST /users', 'PUT /users/<user_id>', 'DELETE /users/<user_id>']}
      />
    );
  }
  if (route === 'partners') {
    return (
      <ResourcePlaceholderPage
        title="Партнёры"
        subtitle="Организации, сотрудники и права доступа"
        endpoints={[
          'GET /partners',
          'GET /partners/<partner_id>',
          'POST /partners',
          'PUT /partners/<partner_id>',
          'GET /partners/<partner_id>/members'
        ]}
      />
    );
  }
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
