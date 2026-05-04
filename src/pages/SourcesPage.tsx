import { useEffect, useMemo, useState } from 'react';
import { api, type DataSource } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { navigate } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';
import { useStore } from '@/store/useStore';

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

function normalizeStatus(source: DataSource) {
  if (source.is_active === false) return 'inactive';
  return source.status || 'active';
}

export default function SourcesPage() {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const canViewCameras = useSessionStore(state => state.hasPermission('cameras.view'));
  const setCamera = useStore(state => state.setCamera);
  const loadCameraMeta = useStore(state => state.loadCameraMeta);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | undefined>();
  const [selectedSource, setSelectedSource] = useState<DataSource | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | undefined>();
  const [filters, setFilters] = useState({
    query: '',
    sourceType: 'all',
    status: 'all'
  });

  async function loadSources() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await api.sources.list({
        partner_id: currentPartnerId,
        is_active: filters.status === 'all'
          ? undefined
          : filters.status !== 'inactive',
        top: 200,
        offset: 0
      });
      setSources(response.items);
      setSelectedSourceId(current => (
        current && response.items.some(item => item.source_id === current)
          ? current
          : response.items[0]?.source_id
      ));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
  }, [currentPartnerId]);

  const filteredSources = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return sources.filter(source => {
      const normalizedStatus = normalizeStatus(source);
      const matchesQuery = !query
        || source.title.toLowerCase().includes(query)
        || source.entity_type.toLowerCase().includes(query)
        || source.source_type.toLowerCase().includes(query)
        || String(source.source_id).includes(query);
      const matchesType = filters.sourceType === 'all' || source.entity_type === filters.sourceType;
      const matchesStatus = filters.status === 'all' || normalizedStatus === filters.status;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [sources, filters]);

  useEffect(() => {
    if (!filteredSources.length) {
      setSelectedSourceId(undefined);
      return;
    }
    if (!selectedSourceId || !filteredSources.some(source => source.source_id === selectedSourceId)) {
      setSelectedSourceId(filteredSources[0].source_id);
    }
  }, [filteredSources, selectedSourceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSourceDetail() {
      if (!selectedSourceId) {
        setSelectedSource(undefined);
        return;
      }

      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const detail = await api.sources.get(selectedSourceId);
        if (cancelled) return;
        setSelectedSource(detail);
        setSources(prev => prev.map(source => source.source_id === detail.source_id ? detail : source));
      } catch (err: any) {
        if (!cancelled) {
          setDetailError(String(err?.message || err));
          setSelectedSource(undefined);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadSourceDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSourceId]);

  const sourceTypes = useMemo(
    () => Array.from(new Set(sources.map(source => source.entity_type))).sort(),
    [sources]
  );

  const metrics = useMemo(() => ({
    total: sources.length,
    active: sources.filter(source => source.is_active !== false).length,
    cameras: sources.filter(source => source.entity_type === 'camera').length,
    partners: new Set(sources.map(source => source.partner_id).filter(value => value !== null)).size
  }), [sources]);

  async function openSourceEntity(source: DataSource) {
    if (source.entity_type !== 'camera') {
      navigate('sources');
      return;
    }

    setCamera(String(source.entity_id));
    try {
      await loadCameraMeta(source.entity_id);
    } catch {
    }
    navigate('cameras');
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Источники</h1>
          <p>
            Общий реестр источников данных
            {currentPartnerId !== undefined ? ` · партнёр #${currentPartnerId}` : ''}
          </p>
        </div>
        <Button onClick={loadSources} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </Button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Источников</div>
          <div className="metric-value">{metrics.total}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value">{metrics.active}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Камер</div>
          <div className="metric-value">{metrics.cameras}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Партнёров</div>
          <div className="metric-value">{metrics.partners}</div>
        </div>
      </div>

      <div className="filter-bar">
        <Field label="Поиск">
          <Input
            value={filters.query}
            onChange={e => setFilters(prev => ({ ...prev, query: e.target.value }))}
            placeholder="Название, тип, ID"
          />
        </Field>
        <Field label="Тип">
          <Select
            value={filters.sourceType}
            onChange={e => setFilters(prev => ({ ...prev, sourceType: e.target.value }))}
          >
            <option value="all">Все</option>
            {sourceTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        </Field>
        <Field label="Статус">
          <Select
            value={filters.status}
            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">Все</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </Select>
        </Field>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="contract-grid">
        <div className="section-panel">
          <div className="table-header sources">
            <span>ID</span>
            <span>Партнёр</span>
            <span>Тип</span>
            <span>Название</span>
            <span>Статус</span>
            <span>Entity</span>
          </div>
          <div className="table-list">
            {filteredSources.map(source => (
              <button
                key={source.source_id}
                type="button"
                className={`table-row sources contract-row-button ${selectedSource?.source_id === source.source_id ? 'active' : ''}`}
                onClick={() => setSelectedSourceId(source.source_id)}
              >
                <span>{source.source_id}</span>
                <span>{source.partner_id ?? '—'}</span>
                <span>{source.source_type}</span>
                <span>{source.title}</span>
                <span>
                  <span className={`status-pill ${normalizeStatus(source) === 'inactive' ? 'paused' : 'active'}`}>
                    {normalizeStatus(source)}
                  </span>
                </span>
                <span>{source.entity_type} #{source.entity_id}</span>
              </button>
            ))}
            {!loading && !filteredSources.length && <div className="empty-state">Источники не найдены.</div>}
          </div>
        </div>

        <div className="section-panel contract-detail-panel">
          {detailLoading && <div className="empty-state">Загрузка источника...</div>}
          {!detailLoading && detailError && <div className="notice error">{detailError}</div>}
          {!detailLoading && !detailError && selectedSource && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedSource.title}</h2>
                  <div className="small">Source #{selectedSource.source_id}</div>
                </div>
                <span className={`status-pill ${normalizeStatus(selectedSource) === 'inactive' ? 'paused' : 'active'}`}>
                  {normalizeStatus(selectedSource)}
                </span>
              </div>

              <div className="details-grid contract-detail-grid">
                <div className="detail-card">
                  <div className="metric-label">Entity type</div>
                  <div className="detail-value">{selectedSource.entity_type}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Entity ID</div>
                  <div className="detail-value">{selectedSource.entity_id}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Partner</div>
                  <div className="detail-value">{selectedSource.partner_id ?? '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Active</div>
                  <div className="detail-value">{selectedSource.is_active ? 'Да' : 'Нет'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Создан</div>
                  <div className="detail-value">{formatDate(selectedSource.created_at)}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Обновлён</div>
                  <div className="detail-value">{formatDate(selectedSource.updated_at)}</div>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant="ghost"
                  onClick={loadSources}
                  disabled={loading}
                >
                  {loading ? 'Обновление...' : 'Обновить список'}
                </Button>
                <Button
                  onClick={() => openSourceEntity(selectedSource)}
                  disabled={selectedSource.entity_type !== 'camera' || !canViewCameras}
                >
                  {selectedSource.entity_type === 'camera' ? `Открыть камеру #${selectedSource.entity_id}` : 'Профиль недоступен'}
                </Button>
              </div>
            </>
          )}
          {!detailLoading && !detailError && !selectedSource && (
            <div className="empty-state">Выберите источник из списка, чтобы открыть карточку.</div>
          )}
        </div>
      </div>
    </section>
  );
}
