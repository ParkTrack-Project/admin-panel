import { useSessionStore } from '@/auth/sessionStore';

export default function ProfilePage() {
  const user = useSessionStore(s => s.user);

  if (!user) {
    return (
      <section className="page-stack">
        <div className="empty-state">Профиль пока недоступен. Войдите в систему ещё раз.</div>
      </section>
    );
  }

  const roles = user.global_roles.length > 0 ? user.global_roles.join(', ') : '—';
  const memberships = user.partner_memberships ?? [];

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Профиль</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="details-grid">
        <Detail label="ID" value={user.user_id} />
        <Detail label="Имя" value={user.full_name || '—'} />
        <Detail label="Роли" value={roles} />
        <Detail label="Права" value={user.permissions.length} />
      </div>

      <div className="section-panel">
        <h2>Партнёрские доступы</h2>
        <div className="table-list">
          {memberships.map(m => (
            <div className="table-row" key={m.partner_id}>
              <div>#{m.partner_id}</div>
              <div>{m.role}</div>
              <div>{m.read_scope}</div>
              <div>{m.write_scope}</div>
              <div>{m.delete_scope}</div>
            </div>
          ))}
          {memberships.length === 0 && <div className="empty-state">Нет партнёрских доступов</div>}
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-card">
      <div className="metric-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}
