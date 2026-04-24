import { useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { Button, Field, Input, Select } from '@/components/UiKit';
import type { PartnerMembership } from '@/types';

type ContractUser = {
  user_id: number;
  email: string;
  full_name: string | null;
  phone?: string | null;
  global_roles: string[];
  is_active: boolean;
  is_email_verified: boolean;
  created_at?: string;
  updated_at?: string;
  partner_memberships: PartnerMembership[];
};

const userEndpoints = [
  'GET /users/me',
  'PUT /users/me',
  'POST /users/me/password',
  'GET /users',
  'GET /users/<user_id>',
  'POST /users',
  'PUT /users/<user_id>'
];

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

export default function UsersAdminPage() {
  const session = useSessionStore();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(session.user?.user_id);

  const users = useMemo<ContractUser[]>(() => {
    if (!session.user) return [];
    return [{
      ...session.user,
      phone: session.user.phone ?? null,
      is_active: true,
      is_email_verified: true,
      created_at: undefined,
      updated_at: undefined
    }];
  }, [session.user]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesQuery = !query.trim()
        || user.email.toLowerCase().includes(query.toLowerCase())
        || (user.full_name ?? '').toLowerCase().includes(query.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.global_roles.includes(roleFilter);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? user.is_active : !user.is_active);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const selectedUser = filteredUsers.find(user => user.user_id === selectedUserId) ?? filteredUsers[0];

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Пользователи</h1>
          <p>Контрактный экран пользователей с текущими данными сессии и readiness по API.</p>
        </div>
        <Button disabled={!session.hasPermission('admin.users.manage')}>Создать пользователя</Button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">В сессии</div>
          <div className="metric-value">{users.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Глобальные роли</div>
          <div className="metric-value">{new Set(users.flatMap(user => user.global_roles)).size}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Memberships</div>
          <div className="metric-value">{users.reduce((sum, user) => sum + user.partner_memberships.length, 0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Backend</div>
          <div className="metric-value">waiting</div>
        </div>
      </div>

      <div className="filter-bar">
        <Field label="Поиск">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="email или имя" />
        </Field>
        <Field label="Роль">
          <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="admin">admin</option>
            <option value="user">user</option>
          </Select>
        </Field>
        <Field label="Статус">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </Select>
        </Field>
      </div>

      <div className="notice warning">
        Полноценный `GET /users` и административные операции ещё ожидают backend. Сейчас экран показывает структуру раздела и реальные данные текущей сессии.
      </div>

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-header users-contract">
            <span>ID</span>
            <span>Email</span>
            <span>Роли</span>
            <span>Статус</span>
            <span>Email verified</span>
          </div>
          <div className="table-list">
            {filteredUsers.map(user => (
              <button
                key={user.user_id}
                type="button"
                className={`table-row users-contract contract-row-button ${selectedUser?.user_id === user.user_id ? 'active' : ''}`}
                onClick={() => setSelectedUserId(user.user_id)}
              >
                <span>{user.user_id}</span>
                <span>{user.email}</span>
                <span>{user.global_roles.join(', ')}</span>
                <span className={`status-pill ${user.is_active ? 'active' : 'paused'}`}>
                  {user.is_active ? 'active' : 'inactive'}
                </span>
                <span>{user.is_email_verified ? 'yes' : 'no'}</span>
              </button>
            ))}
            {!filteredUsers.length && <div className="empty-state">Пользователи не найдены.</div>}
          </div>
        </div>

        <div className="section-panel contract-detail-panel">
          {selectedUser ? (
            <>
              <h2 style={{ margin: 0 }}>{selectedUser.full_name || selectedUser.email}</h2>
              <div className="small">User #{selectedUser.user_id}</div>

              <div className="details-grid contract-detail-grid">
                <div className="detail-card">
                  <div className="metric-label">Email</div>
                  <div className="detail-value">{selectedUser.email}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Телефон</div>
                  <div className="detail-value">{selectedUser.phone || '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Роли</div>
                  <div className="detail-value">{selectedUser.global_roles.join(', ')}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Memberships</div>
                  <div className="detail-value">{selectedUser.partner_memberships.length}</div>
                </div>
              </div>

              <div className="contract-memberships">
                <h3>Partner Memberships</h3>
                <div className="table-header memberships-contract">
                  <span>Partner</span>
                  <span>Role</span>
                  <span>Read</span>
                  <span>Write</span>
                  <span>Delete</span>
                </div>
                <div className="table-list">
                  {selectedUser.partner_memberships.map(membership => (
                    <div className="table-row memberships-contract" key={`${membership.partner_id}-${membership.role}`}>
                      <span>{membership.partner_id}</span>
                      <span>{membership.role}</span>
                      <span>{membership.read_scope}</span>
                      <span>{membership.write_scope}</span>
                      <span>{membership.delete_scope}</span>
                    </div>
                  ))}
                  {!selectedUser.partner_memberships.length && <div className="empty-state">Нет членств в партнёрах.</div>}
                </div>
              </div>

              <div className="contract-meta-block">
                <div className="small">Создано: {formatDate(selectedUser.created_at)}</div>
                <div className="small">Обновлено: {formatDate(selectedUser.updated_at)}</div>
              </div>
            </>
          ) : (
            <div className="empty-state">Нет данных пользователя для детализации.</div>
          )}
        </div>
      </div>

      <div className="section-panel">
        <h2>Контракт API</h2>
        <div className="table-header contract-endpoints">
          <span>Endpoint</span>
          <span>Статус</span>
        </div>
        <div className="table-list">
          {userEndpoints.map(endpoint => (
            <div className="table-row contract-endpoints" key={endpoint}>
              <span>{endpoint}</span>
              <span><span className="status-pill paused">Ожидает backend</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
