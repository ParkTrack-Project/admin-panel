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
  { route: 'profile', label: 'Профиль' }
];

export default function AdminShell({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const session = useSessionStore();
  const apiBase = useStore(state => state.apiBase);
  const token = useStore(state => state.token);
  const setApi = useStore(state => state.setApi);
  const activeMemberships = (session.user?.partner_memberships ?? []).filter(m => m.is_active !== false);
  const membershipOptions = activeMemberships.filter(
    (membership, index, all) => all.findIndex(item => item.partner_id === membership.partner_id) === index
  );
  const canSwitchPartner = session.isAdmin() || membershipOptions.length > 0;

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
              onChange={e => setApi(e.target.value, token)}
              placeholder="https://api.parktrack.live"
            />
          </Field>
          {canSwitchPartner && (
            <Field label="Партнёр">
              <Select
                value={session.currentPartnerId === undefined ? 'all' : String(session.currentPartnerId)}
                onChange={e => {
                  const value = e.target.value;
                  session.setCurrentPartnerId(value === 'all' ? undefined : Number(value));
                }}
              >
                {session.isAdmin() && <option value="all">Все партнёры</option>}
                {membershipOptions.map(m => (
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
