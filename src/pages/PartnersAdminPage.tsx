import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { Button, Field, Input, Select } from '@/components/UiKit';
import type { PartnerMembership } from '@/types';

type ContractPartner = {
  partner_id: number;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  memberships: PartnerMembership[];
};

const partnerEndpoints = [
  'GET /partners',
  'GET /partners/<partner_id>',
  'POST /partners',
  'PUT /partners/<partner_id>',
  'GET /partners/<partner_id>/members',
  'POST /partners/<partner_id>/members',
  'GET /partners/<partner_id>/members/<user_id>'
];

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

export default function PartnersAdminPage() {
  const session = useSessionStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | undefined>(
    session.user?.partner_memberships.find(m => m.is_active !== false)?.partner_id
  );

  const partners = useMemo<ContractPartner[]>(() => {
    const memberships = session.user?.partner_memberships ?? [];
    return memberships.map((membership, index) => ({
      partner_id: membership.partner_id,
      name: `Partner #${membership.partner_id}`,
      slug: `partner-${membership.partner_id}`,
      contact_email: null,
      contact_phone: null,
      is_active: membership.is_active !== false,
      memberships: memberships.filter(item => item.partner_id === membership.partner_id),
      created_at: undefined,
      updated_at: undefined
    })).filter((partner, index, all) => all.findIndex(item => item.partner_id === partner.partner_id) === index);
  }, [session.user]);

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

  const selectedPartner = filteredPartners.find(partner => partner.partner_id === selectedPartnerId) ?? filteredPartners[0];

  useEffect(() => {
    if (!filteredPartners.length) {
      setSelectedPartnerId(undefined);
      return;
    }
    if (!selectedPartnerId || !filteredPartners.some(partner => partner.partner_id === selectedPartnerId)) {
      setSelectedPartnerId(filteredPartners[0].partner_id);
    }
  }, [filteredPartners, selectedPartnerId]);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Партнёры</h1>
          <p>Контрактный экран партнёрских организаций и членств текущей сессии.</p>
        </div>
        <Button disabled={!session.hasPermission('admin.partners.manage')}>Создать партнёра</Button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Из сессии</div>
          <div className="metric-value">{partners.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value">{partners.filter(partner => partner.is_active).length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Memberships</div>
          <div className="metric-value">{partners.reduce((sum, partner) => sum + partner.memberships.length, 0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Backend</div>
          <div className="metric-value">waiting</div>
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
      </div>

      <div className="notice warning">
        Раздел оформлен по контракту `Partners`, но полноценные данные и CRUD-потоки появятся после backend endpoints.
      </div>

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-header partners-contract">
            <span>ID</span>
            <span>Name</span>
            <span>Slug</span>
            <span>Статус</span>
          </div>
          <div className="table-list">
            {filteredPartners.map(partner => (
              <button
                key={partner.partner_id}
                type="button"
                className={`table-row partners-contract contract-row-button ${selectedPartner?.partner_id === partner.partner_id ? 'active' : ''}`}
                onClick={() => setSelectedPartnerId(partner.partner_id)}
              >
                <span>{partner.partner_id}</span>
                <span>{partner.name}</span>
                <span>{partner.slug}</span>
                <span className={`status-pill ${partner.is_active ? 'active' : 'paused'}`}>
                  {partner.is_active ? 'active' : 'inactive'}
                </span>
              </button>
            ))}
            {!filteredPartners.length && <div className="empty-state">Партнёры не найдены.</div>}
          </div>
        </div>

        <div className="section-panel contract-detail-panel">
          {selectedPartner ? (
            <>
              <h2 style={{ margin: 0 }}>{selectedPartner.name}</h2>
              <div className="small">Partner #{selectedPartner.partner_id}</div>

              <div className="details-grid contract-detail-grid">
                <div className="detail-card">
                  <div className="metric-label">Slug</div>
                  <div className="detail-value">{selectedPartner.slug}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Contact email</div>
                  <div className="detail-value">{selectedPartner.contact_email || '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Contact phone</div>
                  <div className="detail-value">{selectedPartner.contact_phone || '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Memberships</div>
                  <div className="detail-value">{selectedPartner.memberships.length}</div>
                </div>
              </div>

              <div className="contract-memberships">
                <h3>Сотрудники и доступы</h3>
                <div className="table-header memberships-contract">
                  <span>User</span>
                  <span>Role</span>
                  <span>Read</span>
                  <span>Write</span>
                  <span>Delete</span>
                </div>
                <div className="table-list">
                  {selectedPartner.memberships.map((membership, index) => (
                    <div className="table-row memberships-contract" key={`${membership.partner_id}-${membership.role}-${index}`}>
                      <span>{membership.user_id ?? session.user?.user_id ?? '—'}</span>
                      <span>{membership.role}</span>
                      <span>{membership.read_scope}</span>
                      <span>{membership.write_scope}</span>
                      <span>{membership.delete_scope}</span>
                    </div>
                  ))}
                  {!selectedPartner.memberships.length && <div className="empty-state">Нет членств для этого партнёра.</div>}
                </div>
              </div>

              <div className="contract-meta-block">
                <div className="small">Создано: {formatDate(selectedPartner.created_at)}</div>
                <div className="small">Обновлено: {formatDate(selectedPartner.updated_at)}</div>
              </div>
            </>
          ) : (
            <div className="empty-state">Нет данных партнёра для детализации.</div>
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
          {partnerEndpoints.map(endpoint => (
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
