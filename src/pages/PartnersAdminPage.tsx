import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { api, type PartnerMemberResponse, type PartnerResponse, type UserProfileResponse } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { BulkActionBar, BulkSelectionCheckbox } from '@/components/BulkActionBar';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { validateOptionalPhone } from '@/utils/phone';
import type { AccessScope } from '@/types';

type AdminPartner = {
  partner_id: number;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type PartnerEditorState = {
  legalName: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  isActive: boolean;
};

type InviteMemberState = {
  userId: string;
  userRole: string;
  readScope: AccessScope | string;
  writeScope: AccessScope | string;
  deleteScope: AccessScope | string;
};

type MemberEditorState = {
  userRole: string;
  readScope: AccessScope | string;
  writeScope: AccessScope | string;
  deleteScope: AccessScope | string;
};

function mapPartner(input: PartnerResponse): AdminPartner {
  return {
    partner_id: input.partner_id,
    name: input.legal_name,
    slug: input.slug,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    is_active: input.is_active,
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

function partnerToEditor(partner: AdminPartner): PartnerEditorState {
  return {
    legalName: partner.name,
    slug: partner.slug,
    contactEmail: partner.contact_email ?? '',
    contactPhone: partner.contact_phone ?? '',
    isActive: partner.is_active
  };
}

function normalizePartnerEditor(editor: PartnerEditorState) {
  return {
    legalName: editor.legalName.trim(),
    slug: editor.slug.trim(),
    contactEmail: editor.contactEmail.trim(),
    contactPhone: editor.contactPhone.trim(),
    isActive: editor.isActive
  };
}

function memberToEditor(member: PartnerMemberResponse): MemberEditorState {
  return {
    userRole: member.user_role,
    readScope: member.read_scope,
    writeScope: member.write_scope,
    deleteScope: member.delete_scope
  };
}

function normalizeMemberEditor(editor: MemberEditorState) {
  return {
    userRole: editor.userRole,
    readScope: editor.readScope,
    writeScope: editor.writeScope,
    deleteScope: editor.deleteScope
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

export default function PartnersAdminPage() {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const canViewUsers = useSessionStore(state => state.hasPermission('admin.users.view'));
  const canManagePartners = useSessionStore(state => state.hasPermission('admin.partners.manage'));
  const canViewMembers = useSessionStore(state => state.hasPermission('partner_members.view'));
  const canInviteMembers = useSessionStore(state => state.hasPermission('partner_members.invite'));
  const canUpdateMembers = useSessionStore(state => state.hasPermission('partner_members.update'));
  const canDisableMembers = useSessionStore(state => state.hasPermission('partner_members.disable'));
  const notifySuccess = useFeedbackStore(state => state.success);
  const confirmAction = useFeedbackStore(state => state.confirm);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | undefined>(currentPartnerId);
  const [selectedPartner, setSelectedPartner] = useState<AdminPartner | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | undefined>();
  const [editor, setEditor] = useState<PartnerEditorState | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createForm, setCreateForm] = useState<PartnerEditorState>({
    legalName: '',
    slug: '',
    contactEmail: '',
    contactPhone: '',
    isActive: true
  });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<number>>(() => new Set());
  const [members, setMembers] = useState<PartnerMemberResponse[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | undefined>();
  const [selectedMemberUserId, setSelectedMemberUserId] = useState<number | undefined>();
  const [memberEditor, setMemberEditor] = useState<MemberEditorState | null>(null);
  const [memberSaveLoading, setMemberSaveLoading] = useState(false);
  const [memberSaveError, setMemberSaveError] = useState<string | undefined>();
  const [inviteForm, setInviteForm] = useState<InviteMemberState>({
    userId: '',
    userRole: 'partner_viewer',
    readScope: 'own',
    writeScope: 'own',
    deleteScope: 'own'
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | undefined>();
  const [userOptions, setUserOptions] = useState<UserProfileResponse[]>([]);

  const filteredPartners = useMemo(() => {
    return partners.filter(partner => {
      const matchesQuery = !query.trim()
        || partner.name.toLowerCase().includes(query.toLowerCase())
        || partner.slug.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? partner.is_active : !partner.is_active);
      return matchesQuery && matchesStatus;
    });
  }, [partners, query, statusFilter]);
  const filteredPartnerIds = useMemo(
    () => filteredPartners.map(partner => partner.partner_id),
    [filteredPartners]
  );

  const selectedMember = members.find(member => member.user_id === selectedMemberUserId);
  const hasPartnerChanges = useMemo(() => {
    if (!selectedPartner || !editor) return false;
    return JSON.stringify(normalizePartnerEditor(editor)) !== JSON.stringify(normalizePartnerEditor(partnerToEditor(selectedPartner)));
  }, [selectedPartner, editor]);
  const hasMemberChanges = useMemo(() => {
    if (!selectedMember || !memberEditor) return false;
    return JSON.stringify(normalizeMemberEditor(memberEditor)) !== JSON.stringify(normalizeMemberEditor(memberToEditor(selectedMember)));
  }, [selectedMember, memberEditor]);

  async function loadPartners() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.partners.list({
        q: query.trim() || undefined,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
        top: 100,
        offset: 0
      });
      const mapped = response.items.map(mapPartner);
      setPartners(mapped);
      setSelectedPartnerId(current => (
        current && mapped.some(partner => partner.partner_id === current)
          ? current
          : mapped[0]?.partner_id
      ));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function loadUserOptions() {
    if (!canViewUsers) {
      setUserOptions([]);
      return;
    }
    try {
      const response = await api.users.list({ top: 100, offset: 0 });
      setUserOptions(response.items);
    } catch {
    }
  }

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    loadUserOptions();
  }, [canViewUsers]);

  useEffect(() => {
    if (!filteredPartners.length) {
      setSelectedPartnerId(undefined);
      return;
    }
    if (!selectedPartnerId || !filteredPartners.some(partner => partner.partner_id === selectedPartnerId)) {
      setSelectedPartnerId(filteredPartners[0].partner_id);
    }
  }, [filteredPartners, selectedPartnerId]);

  useEffect(() => {
    setSelectedPartnerIds(prev => {
      const visible = new Set(filteredPartnerIds);
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredPartnerIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadPartnerDetail() {
      if (!selectedPartnerId) {
        setSelectedPartner(undefined);
        setEditor(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const detail = await api.partners.get(selectedPartnerId);
        if (cancelled) return;
        const mapped = mapPartner(detail);
        setSelectedPartner(mapped);
        setEditor(partnerToEditor(mapped));
        setPartners(prev => prev.map(partner => partner.partner_id === mapped.partner_id ? mapped : partner));
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

    loadPartnerDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedPartnerId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      if (!selectedPartnerId || !canViewMembers) {
        setMembers([]);
        setSelectedMemberUserId(undefined);
        return;
      }

      setMembersLoading(true);
      setMembersError(undefined);
      try {
        const response = await api.partners.listMembers(selectedPartnerId);
        if (cancelled) return;
        setMembers(response.items);
        setSelectedMemberUserId(current => (
          current && response.items.some(member => member.user_id === current)
            ? current
            : response.items[0]?.user_id
        ));
      } catch (err: any) {
        if (!cancelled) {
          setMembersError(String(err?.message || err));
          setMembers([]);
        }
      } finally {
        if (!cancelled) {
          setMembersLoading(false);
        }
      }
    }

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [selectedPartnerId, canViewMembers]);

  useEffect(() => {
    if (!selectedMember) {
      setMemberEditor(null);
      return;
    }
    setMemberEditor(memberToEditor(selectedMember));
  }, [selectedMemberUserId, selectedMember?.partner_membership_id]);

  async function onSavePartner() {
    if (!selectedPartner || !editor) return;
    const legalName = editor.legalName.trim();
    const slug = editor.slug.trim();
    const contactEmail = editor.contactEmail.trim();
    const contactPhone = editor.contactPhone.trim();

    if (!legalName || !slug || !contactEmail || !contactPhone) {
      setSaveError('Заполните все обязательные поля партнёра.');
      return;
    }

    const phoneError = validateOptionalPhone(contactPhone);
    if (phoneError) {
      setSaveError(phoneError);
      return;
    }

    setSaveLoading(true);
    setSaveError(undefined);
    try {
      const updated = await api.partners.update(selectedPartner.partner_id, {
        legal_name: legalName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        is_active: editor.isActive
      });
      const mapped = mapPartner(updated);
      setSelectedPartner(mapped);
      setEditor(partnerToEditor(mapped));
      setPartners(prev => prev.map(partner => partner.partner_id === mapped.partner_id ? mapped : partner));
      notifySuccess('Партнёр сохранён.');
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    } finally {
      setSaveLoading(false);
    }
  }

  async function onCreatePartner() {
    const legalName = createForm.legalName.trim();
    const slug = createForm.slug.trim();
    const contactEmail = createForm.contactEmail.trim();
    const contactPhone = createForm.contactPhone.trim();

    if (!legalName || !slug) {
      setCreateError('Заполните все обязательные поля.');
      return;
    }

    const phoneError = validateOptionalPhone(contactPhone);
    if (phoneError) {
      setCreateError(phoneError);
      return;
    }

    setCreateLoading(true);
    setCreateError(undefined);
    try {
      const response = await api.partners.create({
        legal_name: legalName,
        slug,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined
      });
      await loadPartners();
      setSelectedPartnerId(response.partner_id);
      setShowCreate(false);
      setCreateForm({
        legalName: '',
        slug: '',
        contactEmail: '',
        contactPhone: '',
        isActive: true
      });
      notifySuccess('Партнёр создан.');
    } catch (err: any) {
      setCreateError(String(err?.message || err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeletePartner() {
    if (!selectedPartner) return;

    const confirmed = await confirmAction({
      title: 'Удалить партнёра?',
      message: `Организация "${selectedPartner.name}" будет удалена из backend.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.partners.remove(selectedPartner.partner_id);
      notifySuccess('Партнёр удалён.');
      await loadPartners();
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    }
  }

  function toggleSelectedPartner(partnerId: number, checked: boolean) {
    setSelectedPartnerIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(partnerId);
      } else {
        next.delete(partnerId);
      }
      return next;
    });
  }

  async function onBulkSetPartnersActive(isActive: boolean) {
    if (!selectedPartnerIds.size || !canManagePartners) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = [...selectedPartnerIds];
      const updated = (await Promise.all(
        ids.map(partnerId => api.partners.update(partnerId, { is_active: isActive }))
      )).map(mapPartner);

      setPartners(prev => prev.map(partner => updated.find(item => item.partner_id === partner.partner_id) ?? partner));
      if (selectedPartner && selectedPartnerIds.has(selectedPartner.partner_id)) {
        const nextSelected = updated.find(partner => partner.partner_id === selectedPartner.partner_id);
        if (nextSelected) {
          setSelectedPartner(nextSelected);
          setEditor(partnerToEditor(nextSelected));
        }
      }
      setSelectedPartnerIds(new Set());
      notifySuccess(`Партнёры ${isActive ? 'активированы' : 'деактивированы'}.`);
    } catch (err: any) {
      setError(`Ошибка массового обновления партнёров: ${String(err?.message || err)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function onBulkDeletePartners() {
    if (!selectedPartnerIds.size || !canManagePartners) return;

    const confirmed = await confirmAction({
      title: 'Удалить выбранных партнёров?',
      message: `Будет удалено партнёров: ${selectedPartnerIds.size}. Это действие нельзя отменить.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });
    if (!confirmed) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = new Set(selectedPartnerIds);
      await Promise.all([...ids].map(partnerId => api.partners.remove(partnerId)));
      setPartners(prev => prev.filter(partner => !ids.has(partner.partner_id)));
      setSelectedPartnerIds(new Set());
      notifySuccess('Выбранные партнёры удалены.');
    } catch (err: any) {
      setError(`Ошибка массового удаления партнёров: ${String(err?.message || err)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function onInviteMember() {
    if (!selectedPartnerId) return;

    const userId = parseInt(inviteForm.userId, 10);
    if (!Number.isFinite(userId) || userId < 1) {
      setInviteError('Выберите пользователя для добавления.');
      return;
    }

    setInviteLoading(true);
    setInviteError(undefined);
    try {
      await api.partners.inviteMember(selectedPartnerId, {
        user_id: userId,
        user_role: inviteForm.userRole,
        read_scope: inviteForm.readScope,
        write_scope: inviteForm.writeScope,
        delete_scope: inviteForm.deleteScope
      });
      setInviteForm({
        userId: '',
        userRole: 'partner_viewer',
        readScope: 'own',
        writeScope: 'own',
        deleteScope: 'own'
      });
      notifySuccess('Сотрудник добавлен к партнёру.');
      const response = await api.partners.listMembers(selectedPartnerId);
      setMembers(response.items);
      setSelectedMemberUserId(response.items.at(-1)?.user_id);
    } catch (err: any) {
      setInviteError(String(err?.message || err));
    } finally {
      setInviteLoading(false);
    }
  }

  async function onSaveMember() {
    if (!selectedPartnerId || !selectedMember || !memberEditor) return;

    setMemberSaveLoading(true);
    setMemberSaveError(undefined);
    try {
      const updated = await api.partners.updateMember(selectedPartnerId, selectedMember.user_id, {
        user_role: memberEditor.userRole,
        read_scope: memberEditor.readScope,
        write_scope: memberEditor.writeScope,
        delete_scope: memberEditor.deleteScope
      });
      setMembers(prev => prev.map(member => member.user_id === updated.user_id ? updated : member));
      setMemberEditor(memberToEditor(updated));
      notifySuccess('Доступ сотрудника обновлён.');
    } catch (err: any) {
      setMemberSaveError(String(err?.message || err));
    } finally {
      setMemberSaveLoading(false);
    }
  }

  async function onRemoveMember() {
    if (!selectedPartnerId || !selectedMember) return;

    const confirmed = await confirmAction({
      title: 'Удалить сотрудника из партнёра?',
      message: `${selectedMember.email} будет отключён от организации.`,
      confirmLabel: 'Отключить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.partners.removeMember(selectedPartnerId, selectedMember.user_id);
      notifySuccess('Сотрудник отключён от партнёра.');
      const next = members.filter(member => member.user_id !== selectedMember.user_id);
      setMembers(next);
      setSelectedMemberUserId(next[0]?.user_id);
    } catch (err: any) {
      setMemberSaveError(String(err?.message || err));
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Партнёры</h1>
          <p>Реальный список партнёрских организаций, редактирование карточки и работа с сотрудниками.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setShowCreate(value => !value)} disabled={!canManagePartners}>
            {showCreate ? 'Скрыть форму' : 'Создать партнёра'}
          </Button>
          <Button variant="ghost" onClick={loadPartners} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Партнёров</div>
          <div className="metric-value">{partners.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value">{partners.filter(partner => partner.is_active).length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Сотрудников</div>
          <div className="metric-value">{members.length}</div>
        </div>
      </div>

      <div className="filter-bar">
        <Field label="Поиск">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="name или slug" />
        </Field>
        <Field label="Статус">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </Select>
        </Field>
        <Button variant="ghost" onClick={loadPartners} disabled={loading}>
          {loading ? 'Загрузка...' : 'Применить'}
        </Button>
      </div>

      <BulkActionBar
        selectedCount={selectedPartnerIds.size}
        totalCount={filteredPartners.length}
        busy={bulkLoading}
        canMutate={canManagePartners}
        onActivate={() => onBulkSetPartnersActive(true)}
        onDeactivate={() => onBulkSetPartnersActive(false)}
        onDelete={onBulkDeletePartners}
      />

      {error && <div className="notice error">{error}</div>}

      {showCreate && (
        <div className="section-panel profile-form-panel">
          <h2>Новый партнёр</h2>
          <div className="profile-form-grid">
            <Field label="Название">
              <Input value={createForm.legalName} onChange={e => setCreateForm(prev => ({ ...prev, legalName: e.target.value }))} />
            </Field>
            <Field label="Slug">
              <Input value={createForm.slug} onChange={e => setCreateForm(prev => ({ ...prev, slug: e.target.value }))} />
            </Field>
            <Field label="Contact email">
              <Input value={createForm.contactEmail} onChange={e => setCreateForm(prev => ({ ...prev, contactEmail: e.target.value }))} />
            </Field>
            <Field label="Contact phone">
              <Input value={createForm.contactPhone} onChange={e => setCreateForm(prev => ({ ...prev, contactPhone: e.target.value }))} />
            </Field>
          </div>
          {createError && <div className="notice error">{createError}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={onCreatePartner} disabled={createLoading || !canManagePartners}>
              {createLoading ? 'Создание...' : 'Создать партнёра'}
            </Button>
          </div>
        </div>
      )}

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-scroll">
            <div className="table-header partners-contract">
              <span className="bulk-check-cell">
                <BulkSelectionCheckbox
                  selectedCount={selectedPartnerIds.size}
                  totalCount={filteredPartnerIds.length}
                  busy={bulkLoading}
                  label="Выбрать всех отфильтрованных партнёров"
                  onToggleAll={checked => setSelectedPartnerIds(checked ? new Set(filteredPartnerIds) : new Set())}
                />
              </span>
              <span>ID</span>
              <span>Name</span>
              <span>Slug</span>
              <span>Статус</span>
            </div>
            <div className="table-list">
              {filteredPartners.map(partner => (
                <div
                  key={partner.partner_id}
                  role="button"
                  tabIndex={0}
                  className={`table-row partners-contract contract-row-button ${selectedPartner?.partner_id === partner.partner_id ? 'active' : ''} ${selectedPartnerIds.has(partner.partner_id) ? 'bulk-row-selected' : ''}`}
                  onClick={() => setSelectedPartnerId(partner.partner_id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPartnerId(partner.partner_id);
                    }
                  }}
                >
                  <span className="bulk-check-cell">
                    <input
                      type="checkbox"
                      checked={selectedPartnerIds.has(partner.partner_id)}
                      onClick={e => e.stopPropagation()}
                      onChange={e => toggleSelectedPartner(partner.partner_id, e.target.checked)}
                      aria-label={`Выбрать партнёра ${partner.name}`}
                    />
                  </span>
                  <span>{partner.partner_id}</span>
                  <span>{partner.name}</span>
                  <span>{partner.slug}</span>
                  <span className={`status-pill ${partner.is_active ? 'active' : 'paused'}`}>
                    {partner.is_active ? 'active' : 'inactive'}
                  </span>
                </div>
              ))}
              {!loading && !filteredPartners.length && <div className="empty-state">Партнёры не найдены.</div>}
            </div>
          </div>
        </div>

        <div className="section-panel contract-detail-panel">
          {detailLoading && <div className="empty-state">Загрузка партнёра...</div>}
          {!detailLoading && detailError && <div className="notice error">{detailError}</div>}
          {!detailLoading && !detailError && selectedPartner && editor && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedPartner.name}</h2>
                  <div className="small">Partner #{selectedPartner.partner_id}</div>
                </div>
                <span className={`status-pill ${selectedPartner.is_active ? 'active' : 'paused'}`}>
                  {selectedPartner.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </div>

              <div className="details-grid contract-detail-grid">
                <div className="detail-card">
                  <div className="metric-label">Создан</div>
                  <div className="detail-value">{formatDate(selectedPartner.created_at)}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Обновлён</div>
                  <div className="detail-value">{formatDate(selectedPartner.updated_at)}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Slug</div>
                  <div className="detail-value">{selectedPartner.slug}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Сотрудников</div>
                  <div className="detail-value">{members.length}</div>
                </div>
              </div>

              <div className="profile-form-grid">
                <Field label="Название">
                  <Input
                    disabled={!canManagePartners}
                    value={editor.legalName}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, legalName: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Slug">
                  <Input value={editor.slug} disabled />
                </Field>
                <Field label="Contact email">
                  <Input
                    disabled={!canManagePartners}
                    value={editor.contactEmail}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, contactEmail: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Contact phone">
                  <Input
                    disabled={!canManagePartners}
                    value={editor.contactPhone}
                    onChange={e => {
                      setSaveError(undefined);
                      setEditor(prev => prev ? ({ ...prev, contactPhone: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Статус">
                  <label className="zone-flag-toggle">
                    <input
                      disabled={!canManagePartners}
                      type="checkbox"
                      checked={editor.isActive}
                      onChange={e => {
                        setSaveError(undefined);
                        setEditor(prev => prev ? ({ ...prev, isActive: e.target.checked }) : prev);
                      }}
                    />
                    <span className="small">Организация активна</span>
                  </label>
                </Field>
              </div>

              {saveError && <div className="notice error">{saveError}</div>}

              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSaveError(undefined);
                    setEditor(partnerToEditor(selectedPartner));
                  }}
                  disabled={saveLoading || !hasPartnerChanges || !canManagePartners}
                >
                  Сбросить
                </Button>
                <Button onClick={onSavePartner} disabled={saveLoading || !hasPartnerChanges || !canManagePartners}>
                  {saveLoading ? 'Сохранение...' : 'Сохранить партнёра'}
                </Button>
                <Button variant="danger" onClick={onDeletePartner} disabled={saveLoading || !canManagePartners}>
                  Удалить партнёра
                </Button>
              </div>

              <div className="contract-memberships">
                <h3>Сотрудники и доступы</h3>
                {!canViewMembers && <div className="notice warning">Недостаточно прав для просмотра сотрудников партнёра.</div>}
                {membersError && <div className="notice warning">{membersError}</div>}
                {membersLoading && <div className="empty-state">Загрузка сотрудников...</div>}
                {!membersLoading && canViewMembers && (
                  <div className="table-scroll">
                    <div className="table-header memberships-contract">
                      <span>User</span>
                      <span>Role</span>
                      <span>Read</span>
                      <span>Write</span>
                      <span>Delete</span>
                    </div>
                    <div className="table-list">
                      {members.map(member => (
                        <button
                          type="button"
                          key={member.partner_membership_id}
                          className={`table-row memberships-contract contract-row-button ${selectedMember?.partner_membership_id === member.partner_membership_id ? 'active' : ''}`}
                          onClick={() => setSelectedMemberUserId(member.user_id)}
                        >
                          <span>{member.email}</span>
                          <span>{member.user_role}</span>
                          <span>{member.read_scope}</span>
                          <span>{member.write_scope}</span>
                          <span>{member.delete_scope}</span>
                        </button>
                      ))}
                      {!members.length && <div className="empty-state">У партнёра пока нет сотрудников.</div>}
                    </div>
                  </div>
                )}
              </div>

              {selectedMember && memberEditor && (
                <div className="section-panel profile-form-panel" style={{ padding: 12 }}>
                  <h2>Доступ сотрудника</h2>
                  <div className="small">{selectedMember.email}</div>
                  <div className="profile-form-grid">
                    <Field label="Role">
                      <Select
                        disabled={!canUpdateMembers}
                        value={memberEditor.userRole}
                        onChange={e => {
                          setMemberSaveError(undefined);
                          setMemberEditor(prev => prev ? ({ ...prev, userRole: e.target.value }) : prev);
                        }}
                      >
                        {memberRoleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                      </Select>
                    </Field>
                    <Field label="Read scope">
                      <Select
                        disabled={!canUpdateMembers}
                        value={memberEditor.readScope}
                        onChange={e => {
                          setMemberSaveError(undefined);
                          setMemberEditor(prev => prev ? ({ ...prev, readScope: e.target.value }) : prev);
                        }}
                      >
                        {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                      </Select>
                    </Field>
                    <Field label="Write scope">
                      <Select
                        disabled={!canUpdateMembers}
                        value={memberEditor.writeScope}
                        onChange={e => {
                          setMemberSaveError(undefined);
                          setMemberEditor(prev => prev ? ({ ...prev, writeScope: e.target.value }) : prev);
                        }}
                      >
                        {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                      </Select>
                    </Field>
                    <Field label="Delete scope">
                      <Select
                        disabled={!canUpdateMembers}
                        value={memberEditor.deleteScope}
                        onChange={e => {
                          setMemberSaveError(undefined);
                          setMemberEditor(prev => prev ? ({ ...prev, deleteScope: e.target.value }) : prev);
                        }}
                      >
                        {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                      </Select>
                    </Field>
                  </div>
                  {memberSaveError && <div className="notice error">{memberSaveError}</div>}
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMemberSaveError(undefined);
                        setMemberEditor(memberToEditor(selectedMember));
                      }}
                      disabled={memberSaveLoading || !hasMemberChanges || !canUpdateMembers}
                    >
                      Сбросить
                    </Button>
                    <Button onClick={onSaveMember} disabled={memberSaveLoading || !hasMemberChanges || !canUpdateMembers}>
                      {memberSaveLoading ? 'Сохранение...' : 'Сохранить доступ'}
                    </Button>
                    <Button variant="danger" onClick={onRemoveMember} disabled={memberSaveLoading || !canDisableMembers}>
                      Отключить сотрудника
                    </Button>
                  </div>
                </div>
              )}

              <div className="section-panel profile-form-panel" style={{ padding: 12 }}>
                <h2>Добавить сотрудника</h2>
                {!canInviteMembers && <div className="notice warning">Недостаточно прав для добавления сотрудников.</div>}
                {canInviteMembers && !canViewUsers && <div className="notice warning">Нет доступа к списку пользователей, поэтому выбрать сотрудника нельзя.</div>}
                <div className="profile-form-grid">
                  <Field label="Пользователь">
                    <Select
                      value={inviteForm.userId}
                      disabled={!canInviteMembers || !canViewUsers}
                      onChange={e => {
                        setInviteError(undefined);
                        setInviteForm(prev => ({ ...prev, userId: e.target.value }));
                      }}
                    >
                      <option value="">Выберите пользователя</option>
                      {userOptions.map(user => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.email}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Role">
                    <Select
                      value={inviteForm.userRole}
                      disabled={!canInviteMembers || !canViewUsers}
                      onChange={e => setInviteForm(prev => ({ ...prev, userRole: e.target.value }))}
                    >
                      {memberRoleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                    </Select>
                  </Field>
                  <Field label="Read scope">
                    <Select
                      value={inviteForm.readScope}
                      disabled={!canInviteMembers || !canViewUsers}
                      onChange={e => setInviteForm(prev => ({ ...prev, readScope: e.target.value }))}
                    >
                      {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                    </Select>
                  </Field>
                  <Field label="Write scope">
                    <Select
                      value={inviteForm.writeScope}
                      disabled={!canInviteMembers || !canViewUsers}
                      onChange={e => setInviteForm(prev => ({ ...prev, writeScope: e.target.value }))}
                    >
                      {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                    </Select>
                  </Field>
                  <Field label="Delete scope">
                    <Select
                      value={inviteForm.deleteScope}
                      disabled={!canInviteMembers || !canViewUsers}
                      onChange={e => setInviteForm(prev => ({ ...prev, deleteScope: e.target.value }))}
                    >
                      {scopeOptions.map(scope => <option key={scope} value={scope}>{scope}</option>)}
                    </Select>
                  </Field>
                </div>
                {inviteError && <div className="notice error">{inviteError}</div>}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button onClick={onInviteMember} disabled={inviteLoading || !canInviteMembers || !canViewUsers}>
                    {inviteLoading ? 'Добавление...' : 'Добавить сотрудника'}
                  </Button>
                </div>
              </div>
            </>
          )}
          {!detailLoading && !detailError && !selectedPartner && (
            <div className="empty-state">Выберите партнёра из списка, чтобы открыть карточку.</div>
          )}
        </div>
      </div>
    </section>
  );
}
