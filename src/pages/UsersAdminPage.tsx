import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { api, type UserProfileResponse, type PartnerMemberResponse, type PartnerResponse } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { BulkActionBar } from '@/components/BulkActionBar';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import type { AccessScope, PartnerMembership } from '@/types';

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

type CreateUserState = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  globalRole: string;
};

type AddPartnerState = {
  partnerId: string;
  userRole: string;
  readScope: AccessScope | string;
  writeScope: AccessScope | string;
  deleteScope: AccessScope | string;
};

type PartnerOption = Pick<PartnerResponse, 'partner_id' | 'legal_name'>;

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

const scopeOptions: Array<AccessScope | string> = ['none', 'own', 'assigned', 'own_or_assigned', 'partner_all', 'global_all'];
const memberRoleOptions = ['partner_owner', 'partner_admin', 'partner_manager', 'partner_analyst', 'partner_viewer'];
const emptyCreateUserForm: CreateUserState = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  globalRole: 'user'
};

export default function UsersAdminPage() {
  const sessionUser = useSessionStore(state => state.user);
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const activeSessionMemberships = (sessionUser?.partner_memberships ?? []).filter(m => m.is_active !== false);
  const canManageUsers = useSessionStore(state => state.hasPermission('admin.users.manage'));
  const canViewPartnerMembers = useSessionStore(state => state.hasPermission('partner_members.view'));
  const canInvitePartnerMembers = useSessionStore(state => state.hasPermission('partner_members.invite'));
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
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserState>(emptyCreateUserForm);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | undefined>();
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(() => new Set());
  const [membershipsByUserId, setMembershipsByUserId] = useState<Record<number, PartnerMembership[]>>({});
  const [partnerOptions, setPartnerOptions] = useState<PartnerOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipsError, setMembershipsError] = useState<string | undefined>();
  const [addPartnerForm, setAddPartnerForm] = useState<AddPartnerState>({
    partnerId: '',
    userRole: 'partner_viewer',
    readScope: 'own',
    writeScope: 'own',
    deleteScope: 'own'
  });
  const [addPartnerLoading, setAddPartnerLoading] = useState(false);
  const [addPartnerError, setAddPartnerError] = useState<string | undefined>();

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
  const filteredUserIds = useMemo(
    () => filteredUsers.map(user => user.user_id),
    [filteredUsers]
  );

  const selectedMemberships = selectedUser ? membershipsByUserId[selectedUser.user_id] ?? [] : [];
  const partnerNameById = useMemo(
    () => new Map(partnerOptions.map(partner => [partner.partner_id, partner.legal_name])),
    [partnerOptions]
  );
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
    const fallbackPartnerOptions: PartnerOption[] = activeSessionMemberships
      .filter((membership, index, list) => list.findIndex(item => item.partner_id === membership.partner_id) === index)
      .map(membership => ({
        partner_id: membership.partner_id,
        legal_name: `Партнёр #${membership.partner_id}`
      }));

    if (!canViewPartners && !fallbackPartnerOptions.length) {
      setMembershipsByUserId({});
      setPartnerOptions([]);
      setMembershipsError(undefined);
      return;
    }

    setMembershipsLoading(true);
    setMembershipsError(undefined);
    try {
      const partnerItems: PartnerOption[] = canViewPartners
        ? (await api.partners.list()).items
        : fallbackPartnerOptions;
      setPartnerOptions(partnerItems);
      setAddPartnerForm(prev => {
        if (prev.partnerId || !partnerItems.length || canViewPartners) return prev;
        const defaultPartnerId = currentPartnerId ?? partnerItems[0].partner_id;
        return { ...prev, partnerId: String(defaultPartnerId) };
      });

      if (!canViewPartnerMembers) {
        setMembershipsByUserId({});
        return;
      }

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
      setPartnerOptions([]);
    } finally {
      setMembershipsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadMemberships();
  }, [canViewPartnerMembers, canViewPartners, currentPartnerId, activeSessionMemberships.length]);

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
    setSelectedUserIds(prev => {
      const visible = new Set(filteredUserIds);
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredUserIds]);

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

  function toggleSelectedUser(userId: number, checked: boolean) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return next;
    });
  }

  async function onBulkSetUsersActive(isActive: boolean) {
    if (!selectedUserIds.size || !canManageUsers) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = [...selectedUserIds];
      const updated = (await Promise.all(
        ids.map(userId => api.users.update(userId, { is_active: isActive }))
      )).map(mapUser);

      setUsers(prev => prev.map(user => updated.find(item => item.user_id === user.user_id) ?? user));
      if (selectedUser && selectedUserIds.has(selectedUser.user_id)) {
        const nextSelected = updated.find(user => user.user_id === selectedUser.user_id);
        if (nextSelected) {
          setSelectedUser(nextSelected);
          setEditor(userToEditor(nextSelected));
        }
      }
      setSelectedUserIds(new Set());
      notifySuccess(`Пользователи ${isActive ? 'активированы' : 'деактивированы'}.`);
    } catch (err: any) {
      setError(`Ошибка массового обновления пользователей: ${String(err?.message || err)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function onBulkDeleteUsers() {
    if (!selectedUserIds.size || !canManageUsers) return;

    const confirmed = await confirmAction({
      title: 'Удалить выбранных пользователей?',
      message: `Будет удалено пользователей: ${selectedUserIds.size}. Это действие нельзя отменить.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });
    if (!confirmed) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = new Set(selectedUserIds);
      await Promise.all([...ids].map(userId => api.users.remove(userId)));
      setUsers(prev => prev.filter(user => !ids.has(user.user_id)));
      setSelectedUserIds(new Set());
      notifySuccess('Выбранные пользователи удалены.');
    } catch (err: any) {
      setError(`Ошибка массового удаления пользователей: ${String(err?.message || err)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function onCreateUser(e: React.FormEvent) {
    e.preventDefault();

    const email = createUserForm.email.trim();
    const password = createUserForm.password;
    const fullName = createUserForm.fullName.trim();
    const phone = createUserForm.phone.trim();

    if (!email) {
      setCreateUserError('Email обязателен.');
      return;
    }
    if (password.length < 6) {
      setCreateUserError('В пароле должно быть не менее 6 символов.');
      return;
    }

    setCreateUserLoading(true);
    setCreateUserError(undefined);
    try {
      const created = mapUser(await api.users.create({
        email,
        password,
        full_name: fullName || null,
        phone: phone || null,
        global_role: createUserForm.globalRole
      }));
      notifySuccess('Пользователь создан.');
      setCreateUserForm(emptyCreateUserForm);
      setShowCreateUser(false);
      setUsers(prev => [created, ...prev.filter(user => user.user_id !== created.user_id)]);
      setSelectedUserId(created.user_id);
      await loadMemberships();
    } catch (err: any) {
      setCreateUserError(String(err?.message || err));
    } finally {
      setCreateUserLoading(false);
    }
  }

  async function onAddUserToPartner() {
    if (!selectedUser) return;

    const partnerId = parseInt(addPartnerForm.partnerId, 10);
    if (!Number.isFinite(partnerId) || partnerId < 1) {
      setAddPartnerError('Выберите партнёра.');
      return;
    }

    setAddPartnerLoading(true);
    setAddPartnerError(undefined);
    try {
      await api.partners.inviteMember(partnerId, {
        user_id: selectedUser.user_id,
        user_role: addPartnerForm.userRole,
        read_scope: addPartnerForm.readScope,
        write_scope: addPartnerForm.writeScope,
        delete_scope: addPartnerForm.deleteScope
      });
      notifySuccess('Пользователь добавлен к партнёру.');
      setAddPartnerForm({
        partnerId: '',
        userRole: 'partner_viewer',
        readScope: 'own',
        writeScope: 'own',
        deleteScope: 'own'
      });
      await loadMemberships();
    } catch (err: any) {
      setAddPartnerError(String(err?.message || err));
    } finally {
      setAddPartnerLoading(false);
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
        <Button
          onClick={() => {
            setCreateUserError(undefined);
            setShowCreateUser(prev => !prev);
          }}
          disabled={!canManageUsers}
        >
          {showCreateUser ? 'Скрыть форму' : 'Новый пользователь'}
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
      </div>

      <BulkActionBar
        selectedCount={selectedUserIds.size}
        totalCount={filteredUsers.length}
        busy={bulkLoading}
        canMutate={canManageUsers}
        onSelectAll={() => setSelectedUserIds(new Set(filteredUserIds))}
        onClear={() => setSelectedUserIds(new Set())}
        onActivate={() => onBulkSetUsersActive(true)}
        onDeactivate={() => onBulkSetUsersActive(false)}
        onDelete={onBulkDeleteUsers}
      />

      {error && <div className="notice error">{error}</div>}
      {membershipsError && <div className="notice warning">{membershipsError}</div>}
      {!canManageUsers && (
        <div className="notice warning">Создание пользователей доступно только с правом admin.users.manage.</div>
      )}

      {showCreateUser && canManageUsers && (
        <div className="section-panel profile-form-panel">
          <h2>Новый пользователь</h2>
          <form className="profile-form-grid" onSubmit={onCreateUser}>
            <Field label="Email *">
              <Input
                type="email"
                value={createUserForm.email}
                onChange={e => {
                  setCreateUserError(undefined);
                  setCreateUserForm(prev => ({ ...prev, email: e.target.value }));
                }}
                placeholder="user@example.com"
                required
              />
            </Field>
            <Field label="Пароль *">
              <Input
                type="password"
                value={createUserForm.password}
                onChange={e => {
                  setCreateUserError(undefined);
                  setCreateUserForm(prev => ({ ...prev, password: e.target.value }));
                }}
                placeholder="Минимум 6 символов"
                minLength={6}
                required
              />
            </Field>
            <Field label="Полное имя">
              <Input
                value={createUserForm.fullName}
                onChange={e => {
                  setCreateUserError(undefined);
                  setCreateUserForm(prev => ({ ...prev, fullName: e.target.value }));
                }}
                placeholder="Имя сотрудника"
              />
            </Field>
            <Field label="Телефон">
              <Input
                value={createUserForm.phone}
                onChange={e => {
                  setCreateUserError(undefined);
                  setCreateUserForm(prev => ({ ...prev, phone: e.target.value }));
                }}
                placeholder="+79991234567"
              />
            </Field>
            <Field label="Глобальная роль">
              <Select
                value={createUserForm.globalRole}
                onChange={e => {
                  setCreateUserError(undefined);
                  setCreateUserForm(prev => ({ ...prev, globalRole: e.target.value }));
                }}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </Field>
            <div className="row create-user-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreateUserError(undefined);
                  setCreateUserForm(emptyCreateUserForm);
                  setShowCreateUser(false);
                }}
                disabled={createUserLoading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={createUserLoading}>
                {createUserLoading ? 'Создание...' : 'Создать пользователя'}
              </Button>
            </div>
          </form>
          {createUserError && <div className="notice error">{createUserError}</div>}
        </div>
      )}

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-scroll">
            <div className="table-header users-contract">
              <span className="bulk-check-cell"></span>
              <span>ID</span>
              <span>Email</span>
              <span>Роль</span>
              <span>Статус</span>
              <span>Создан</span>
            </div>
            <div className="table-list">
              {filteredUsers.map(user => (
                <div
                  key={user.user_id}
                  role="button"
                  tabIndex={0}
                  className={`table-row users-contract contract-row-button ${selectedUser?.user_id === user.user_id ? 'active' : ''} ${selectedUserIds.has(user.user_id) ? 'bulk-row-selected' : ''}`}
                  onClick={() => setSelectedUserId(user.user_id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedUserId(user.user_id);
                    }
                  }}
                >
                  <span className="bulk-check-cell">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user.user_id)}
                      onClick={e => e.stopPropagation()}
                      onChange={e => toggleSelectedUser(user.user_id, e.target.checked)}
                      aria-label={`Выбрать пользователя ${user.email}`}
                    />
                  </span>
                  <span>{user.user_id}</span>
                  <span>{user.email}</span>
                  <span>{user.global_role}</span>
                  <span className={`status-pill ${user.is_active ? 'active' : 'paused'}`}>
                    {user.is_active ? 'active' : 'inactive'}
                  </span>
                  <span>{formatDate(user.created_at)}</span>
                </div>
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
                {membershipsLoading && <div className="empty-state">Загрузка членств...</div>}
                {!membershipsLoading && canViewPartnerMembers && (
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
                          <span>{partnerNameById.get(membership.partner_id) ?? `Партнёр #${membership.partner_id}`}</span>
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

                {canInvitePartnerMembers && partnerOptions.length > 0 && (
                  <div className="partner-attach-panel">
                    <h3>Добавить к партнёру</h3>
                    <div className="profile-form-grid">
                      <Field label="Партнёр">
                        <Select
                          value={addPartnerForm.partnerId}
                          onChange={e => {
                            setAddPartnerError(undefined);
                            setAddPartnerForm(prev => ({ ...prev, partnerId: e.target.value }));
                          }}
                        >
                          <option value="">Выберите партнёра</option>
                          {partnerOptions.map(partner => (
                            <option key={partner.partner_id} value={partner.partner_id}>
                              {partner.legal_name} · #{partner.partner_id}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Role">
                        <Select
                          value={addPartnerForm.userRole}
                          onChange={e => {
                            setAddPartnerError(undefined);
                            setAddPartnerForm(prev => ({ ...prev, userRole: e.target.value }));
                          }}
                        >
                          {memberRoleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                        </Select>
                      </Field>
                      <Field label="Read scope">
                        <Select
                          value={addPartnerForm.readScope}
                          onChange={e => setAddPartnerForm(prev => ({ ...prev, readScope: e.target.value }))}
                        >
                          {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                        </Select>
                      </Field>
                      <Field label="Write scope">
                        <Select
                          value={addPartnerForm.writeScope}
                          onChange={e => setAddPartnerForm(prev => ({ ...prev, writeScope: e.target.value }))}
                        >
                          {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                        </Select>
                      </Field>
                      <Field label="Delete scope">
                        <Select
                          value={addPartnerForm.deleteScope}
                          onChange={e => setAddPartnerForm(prev => ({ ...prev, deleteScope: e.target.value }))}
                        >
                          {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                        </Select>
                      </Field>
                    </div>
                    {addPartnerError && <div className="notice error">{addPartnerError}</div>}
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button
                        onClick={onAddUserToPartner}
                        disabled={addPartnerLoading || !addPartnerForm.partnerId || membershipsLoading}
                      >
                        {addPartnerLoading ? 'Добавление...' : 'Добавить к партнёру'}
                      </Button>
                    </div>
                  </div>
                )}
                {canInvitePartnerMembers && partnerOptions.length === 0 && (
                  <div className="notice warning">Нет доступных партнёров для добавления пользователя.</div>
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
