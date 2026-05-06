import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { api, type UserProfileResponse, type PartnerMemberResponse, type PartnerResponse } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import type { PartnerMembership } from '@/types';

type AdminUser = {
  user_id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  global_role: string;
  is_active: boolean;
  is_email_verified: boolean;
  created_at?: string;
  updated_at?: string;
};

type UserEditorState = {
  email: string;
  fullName: string;
  phone: string;
  globalRole: string;
  isActive: boolean;
};

function mapUser(input: UserProfileResponse): AdminUser {
  return {
    user_id: input.user_id,
    email: input.email,
    full_name: input.full_name,
    phone: input.phone ?? null,
    global_role: input.global_role ?? input.global_roles?.[0] ?? 'user',
    is_active: input.is_active !== false,
    is_email_verified: input.is_email_verified !== false,
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

function userToEditor(user: AdminUser): UserEditorState {
  return {
    email: user.email,
    fullName: user.full_name ?? '',
    phone: user.phone ?? '',
    globalRole: user.global_role,
    isActive: user.is_active
  };
}

function normalizeEditor(editor: UserEditorState) {
  return {
    email: editor.email.trim(),
    fullName: editor.fullName.trim(),
    phone: editor.phone.trim(),
    globalRole: editor.globalRole,
    isActive: editor.isActive
  };
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

export default function UsersAdminPage() {
  const canManageUsers = useSessionStore(state => state.hasPermission('admin.users.manage'));
  const canViewPartnerMembers = useSessionStore(state => state.hasPermission('partner_members.view'));
  const canViewPartners = useSessionStore(state => state.hasPermission('admin.partners.view'));
  const notifySuccess = useFeedbackStore(state => state.success);
  const confirmAction = useFeedbackStore(state => state.confirm);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();
  const [selectedUser, setSelectedUser] = useState<AdminUser | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | undefined>();
  const [editor, setEditor] = useState<UserEditorState | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [membershipsByUserId, setMembershipsByUserId] = useState<Record<number, PartnerMembership[]>>({});
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipsError, setMembershipsError] = useState<string | undefined>();

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesQuery = !query.trim()
        || user.email.toLowerCase().includes(query.toLowerCase())
        || (user.full_name ?? '').toLowerCase().includes(query.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.global_role === roleFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? user.is_active : !user.is_active);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const selectedMemberships = selectedUser ? membershipsByUserId[selectedUser.user_id] ?? [] : [];
  const hasEditorChanges = useMemo(() => {
    if (!selectedUser || !editor) return false;
    return JSON.stringify(normalizeEditor(editor)) !== JSON.stringify(normalizeEditor(userToEditor(selectedUser)));
  }, [selectedUser, editor]);

  async function loadUsers() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.users.list({
        q: query.trim() || undefined,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
        top: 100,
        offset: 0
      });
      const mapped = response.items.map(mapUser);
      setUsers(mapped);
      setSelectedUserId(current => (
        current && mapped.some(user => user.user_id === current)
          ? current
          : mapped[0]?.user_id
      ));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMemberships() {
    if (!canViewPartnerMembers || !canViewPartners) {
      setMembershipsByUserId({});
      setMembershipsError(undefined);
      return;
    }

    setMembershipsLoading(true);
    setMembershipsError(undefined);
    try {
      const partnersResponse = await api.partners.list();
      const partnerItems: PartnerResponse[] = partnersResponse.items;
      const responses = await Promise.all(
        partnerItems.map(async partner => {
          try {
            const members = await api.partners.listMembers(partner.partner_id);
            return { partnerId: partner.partner_id, items: members.items };
          } catch {
            return { partnerId: partner.partner_id, items: [] as PartnerMemberResponse[] };
          }
        })
      );

      const nextMemberships: Record<number, PartnerMembership[]> = {};
      for (const response of responses) {
        for (const member of response.items) {
          const mapped: PartnerMembership = {
            partner_id: response.partnerId,
            user_id: member.user_id,
            role: member.user_role,
            permissions: [],
            read_scope: member.read_scope,
            write_scope: member.write_scope,
            delete_scope: member.delete_scope,
            created_at: member.created_at
          };
          nextMemberships[member.user_id] = [...(nextMemberships[member.user_id] ?? []), mapped];
        }
      }

      setMembershipsByUserId(nextMemberships);
    } catch (err: any) {
      setMembershipsError(String(err?.message || err));
    } finally {
      setMembershipsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadMemberships();
  }, [canViewPartnerMembers, canViewPartners]);

  useEffect(() => {
    if (!filteredUsers.length) {
      setSelectedUserId(undefined);
      return;
    }
    if (!selectedUserId || !filteredUsers.some(user => user.user_id === selectedUserId)) {
      setSelectedUserId(filteredUsers[0].user_id);
    }
  }, [filteredUsers, selectedUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserDetail() {
      if (!selectedUserId) {
        setSelectedUser(undefined);
        setEditor(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const detail = await api.users.get(selectedUserId);
        if (cancelled) return;
        const mapped = mapUser(detail);
        setSelectedUser(mapped);
        setEditor(userToEditor(mapped));
        setUsers(prev => prev.map(user => user.user_id === mapped.user_id ? mapped : user));
      } catch (err: any) {
        if (!cancelled) {
          setDetailError(String(err?.message || err));
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadUserDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  async function onSaveUser() {
    if (!selectedUser || !editor) return;

    const email = editor.email.trim();
    const fullName = editor.fullName.trim();
    const phone = editor.phone.trim();

    if (!email) {
      setSaveError('Email обязателен.');
      return;
    }

    if (!fullName) {
      setSaveError('Имя пользователя обязательно.');
      return;
    }

    setSaveLoading(true);
    setSaveError(undefined);
    try {
      const updated = await api.users.update(selectedUser.user_id, {
        email,
        full_name: fullName,
        phone: phone || null,
        global_role: editor.globalRole,
        is_active: editor.isActive
      });
      const mapped = mapUser(updated);
      setSelectedUser(mapped);
      setEditor(userToEditor(mapped));
      setUsers(prev => prev.map(user => user.user_id === mapped.user_id ? mapped : user));
      notifySuccess('Пользователь сохранён.');
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    } finally {
      setSaveLoading(false);
    }
  }

  async function onDeactivateUser() {
    if (!selectedUser) return;

    const confirmed = await confirmAction({
      title: 'Деактивировать пользователя?',
      message: `Пользователь ${selectedUser.email} будет удалён из текущей таблицы backend.`,
      confirmLabel: 'Деактивировать',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.users.remove(selectedUser.user_id);
      notifySuccess('Пользователь деактивирован.');
      await loadUsers();
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    }
  }

  const totalMemberships = useMemo(
    () => Object.values(membershipsByUserId).reduce((sum, memberships) => sum + memberships.length, 0),
    [membershipsByUserId]
  );

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Пользователи</h1>
          <p>Реальный список пользователей, редактирование профиля и статуса через текущий backend.</p>
        </div>
        <Button disabled>
          {canManageUsers ? 'Создание пользователя ждёт backend endpoint' : 'Недостаточно прав для создания'}
        </Button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Пользователей</div>
          <div className="metric-value">{users.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value">{users.filter(user => user.is_active).length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ролей</div>
          <div className="metric-value">{new Set(users.map(user => user.global_role)).size}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Memberships</div>
          <div className="metric-value">{totalMemberships}</div>
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
        <Button variant="ghost" onClick={loadUsers} disabled={loading}>
          {loading ? 'Загрузка...' : 'Применить'}
        </Button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {membershipsError && <div className="notice warning">{membershipsError}</div>}

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-scroll">
            <div className="table-header users-contract">
              <span>ID</span>
              <span>Email</span>
              <span>Роль</span>
              <span>Статус</span>
              <span>Создан</span>
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
                  <span>{user.global_role}</span>
                  <span className={`status-pill ${user.is_active ? 'active' : 'paused'}`}>
                    {user.is_active ? 'active' : 'inactive'}
                  </span>
                  <span>{formatDate(user.created_at)}</span>
                </button>
              ))}
              {!loading && !filteredUsers.length && <div className="empty-state">Пользователи не найдены.</div>}
            </div>
          </div>
        </div>

        <div className="section-panel contract-detail-panel">
          {detailLoading && <div className="empty-state">Загрузка пользователя...</div>}
          {!detailLoading && detailError && <div className="notice error">{detailError}</div>}
          {!detailLoading && !detailError && selectedUser && editor && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedUser.full_name || selectedUser.email}</h2>
                  <div className="small">User #{selectedUser.user_id}</div>
                </div>
                <span className={`status-pill ${selectedUser.is_active ? 'active' : 'paused'}`}>
                  {selectedUser.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </div>

              <div className="details-grid contract-detail-grid">
                <div className="detail-card">
                  <div className="metric-label">Создан</div>
                  <div className="detail-value">{formatDate(selectedUser.created_at)}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Обновлён</div>
                  <div className="detail-value">{formatDate(selectedUser.updated_at)}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Email verified</div>
                  <div className="detail-value">{selectedUser.is_email_verified ? 'Да' : 'Нет'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Memberships</div>
                  <div className="detail-value">{selectedMemberships.length}</div>
                </div>
              </div>

              <div className="profile-form-grid">
                <Field label="Email">
                  <Input
                    disabled={!canManageUsers}
                    value={editor.email}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, email: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Полное имя">
                  <Input
                    disabled={!canManageUsers}
                    value={editor.fullName}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, fullName: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Телефон">
                  <Input
                    disabled={!canManageUsers}
                    value={editor.phone}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, phone: e.target.value }) : prev);
                    }}
                    placeholder="+79991234567"
                  />
                </Field>
                <Field label="Глобальная роль">
                  <Select
                    disabled={!canManageUsers}
                    value={editor.globalRole}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, globalRole: e.target.value }) : prev);
                    }}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </Select>
                </Field>
                <Field label="Статус">
                  <label className="zone-flag-toggle">
                    <input
                      disabled={!canManageUsers}
                      type="checkbox"
                      checked={editor.isActive}
                      onChange={e => {
                        setSaveError(undefined);
                        setEditor(prev => prev ? ({ ...prev, isActive: e.target.checked }) : prev);
                      }}
                    />
                    <span className="small">Учётная запись активна</span>
                  </label>
                </Field>
              </div>

              {saveError && <div className="notice error">{saveError}</div>}

              <div className="contract-memberships">
                <h3>Partner Memberships</h3>
                {!canViewPartnerMembers && (
                  <div className="notice warning">Недостаточно прав для просмотра членств в партнёрах.</div>
                )}
                {canViewPartnerMembers && !canViewPartners && (
                  <div className="notice warning">Нет доступа к списку партнёров, поэтому членства пользователя неполные.</div>
                )}
                {membershipsLoading && <div className="empty-state">Загрузка членств...</div>}
                {!membershipsLoading && canViewPartnerMembers && canViewPartners && (
                  <div className="table-scroll">
                    <div className="table-header memberships-contract">
                      <span>Partner</span>
                      <span>Role</span>
                      <span>Read</span>
                      <span>Write</span>
                      <span>Delete</span>
                    </div>
                    <div className="table-list">
                      {selectedMemberships.map((membership, index) => (
                        <div className="table-row memberships-contract" key={`${membership.partner_id}-${membership.role}-${index}`}>
                          <span>{membership.partner_id}</span>
                          <span>{membership.role}</span>
                          <span>{membership.read_scope}</span>
                          <span>{membership.write_scope}</span>
                          <span>{membership.delete_scope}</span>
                        </div>
                      ))}
                      {!selectedMemberships.length && (
                        <div className="empty-state">
                          Для этого пользователя backend пока не вернул членства в партнёрах.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSaveError(undefined);
                    setEditor(userToEditor(selectedUser));
                  }}
                  disabled={saveLoading || !hasEditorChanges || !canManageUsers}
                >
                  Сбросить
                </Button>
                <Button onClick={onSaveUser} disabled={saveLoading || !hasEditorChanges || !canManageUsers}>
                  {saveLoading ? 'Сохранение...' : 'Сохранить пользователя'}
                </Button>
                <Button variant="danger" onClick={onDeactivateUser} disabled={saveLoading || !canManageUsers}>
                  Деактивировать
                </Button>
              </div>
            </>
          )}
          {!detailLoading && !detailError && !selectedUser && (
            <div className="empty-state">Выберите пользователя из списка, чтобы открыть карточку.</div>
          )}
        </div>
      </div>
    </section>
  );
}
