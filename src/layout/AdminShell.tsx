import { Button, Field, Input, Select } from '@/components/UiKit';
import { useSessionStore } from '@/auth/sessionStore';
import { AppRoute, navigate } from '@/router/routes';
import { useStore } from '@/store/useStore';

type NavItem = {
  route: AppRoute;
  label: string;
  permission?: string;
};

const navItems: NavItem[] = [
  { route: 'dashboard', label: 'Обзор' },
  { route: 'cameras', label: 'Камеры', permission: 'cameras.view' },
  { route: 'zones', label: 'Зоны', permission: 'zones.view' },
  { route: 'sources', label: 'Источники', permission: 'sources.view' },
  { route: 'users', label: 'Пользователи', permission: 'admin.users.view' },
  { route: 'partners', label: 'Партнёры', permission: 'admin.partners.view' },
  { route: 'labeler', label: 'Разметка', permission: 'zones.update' },
  { route: 'profile', label: 'Профиль' }
];

export default function AdminShell({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const session = useSessionStore();
  const { apiBase, token } = useStore();
  const activeMemberships = session.user?.partner_memberships.filter(m => m.is_active !== false) ?? [];

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="brand-block">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">ParkTrack</div>
            <div className="brand-subtitle">Admin</div>
          </div>
        </div>

        <nav className="admin-nav">
          {navItems
            .filter(item => !item.permission || session.hasPermission(item.permission))
            .map(item => (
              <button
                key={item.route}
                className={`admin-nav-item ${route === item.route ? 'active' : ''}`}
                onClick={() => navigate(item.route)}
              >
                {item.label}
              </button>
            ))}
        </nav>
      </aside>

      <header className="admin-header">
        <div className="admin-header-left">
          <Field label="API Base">
            <Input
              value={apiBase}
              onChange={e => useStore.setState({ apiBase: e.target.value })}
              placeholder="https://api.parktrack.live"
            />
          </Field>
          {activeMemberships.length > 0 && (
            <Field label="Партнёр">
              <Select value={String(activeMemberships[0].partner_id)} disabled>
                {activeMemberships.map(m => (
                  <option key={m.partner_id} value={m.partner_id}>
                    #{m.partner_id} · {m.role}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="admin-header-user">
          <div>
            <div className="admin-user-name">{session.user?.full_name || session.user?.email}</div>
            <div className="small">{token || session.accessToken ? 'Сессия активна' : 'Без токена'}</div>
          </div>
          <Button variant="ghost" onClick={() => session.logout()}>Выйти</Button>
        </div>
      </header>

      <main className="admin-content">
        {children}
      </main>
    </div>
  );
}
