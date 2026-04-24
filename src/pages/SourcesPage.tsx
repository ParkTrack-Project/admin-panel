import { useEffect, useMemo, useState } from 'react';
import { api, Camera } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { navigate } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';

export default function SourcesPage() {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setCameras(await api.listCameras({ partner_id: currentPartnerId }));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function safeLoad() {
      setLoading(true);
      setError(undefined);
      try {
        const nextCameras = await api.listCameras({ partner_id: currentPartnerId });
        if (!active) return;
        setCameras(nextCameras);
      } catch (err: any) {
        if (!active) return;
        setError(String(err?.message || err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    safeLoad();
    return () => {
      active = false;
    };
  }, [currentPartnerId]);

  const items = useMemo(() => {
    return cameras
      .map(camera => ({
        source_id: camera.camera_id,
        partner_id: camera.partner_id ?? null,
        entity_id: camera.camera_id,
        title: camera.title,
        source_type: 'camera_stream',
        entity_type: 'camera',
        status: camera.is_active === false ? 'paused' : 'active',
        last_data_at: camera.updated_at
      }))
      .filter(source => {
        const matchesQuery = !query || source.title.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = status === 'all' || source.status === status;
        return matchesQuery && matchesStatus;
      });
  }, [cameras, query, status]);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Источники</h1>
          <p>
            Единый реестр источников данных
            {currentPartnerId !== undefined ? ` · партнёр #${currentPartnerId}` : ''}
          </p>
        </div>
        <Button onClick={load} disabled={loading}>{loading ? 'Загрузка...' : 'Обновить'}</Button>
      </div>

      <div className="filter-bar">
        <Field label="Поиск">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Название источника" />
        </Field>
        <Field label="Статус">
          <Select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">Все</option>
            <option value="active">active</option>
            <option value="paused">paused</option>
          </Select>
        </Field>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="section-panel">
        <div className="table-header sources">
          <span>ID</span>
          <span>Партнёр</span>
          <span>Тип</span>
          <span>Название</span>
          <span>Статус</span>
          <span>Профиль</span>
        </div>
        <div className="table-list">
          {items.map(source => (
            <div className="table-row sources" key={source.source_id}>
              <div>{source.source_id}</div>
              <div>{source.partner_id ?? '—'}</div>
              <div>{source.source_type}</div>
              <div>{source.title}</div>
              <div><span className={`status-pill ${source.status}`}>{source.status}</span></div>
              <div>
                <Button variant="ghost" onClick={() => navigate('cameras')}>
                  camera #{source.entity_id}
                </Button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && <div className="empty-state">Источники не найдены</div>}
        </div>
      </div>
    </section>
  );
}
