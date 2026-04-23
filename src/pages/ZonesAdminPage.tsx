import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Button, Field, Input } from '@/components/UiKit';
import type { ParkingZone } from '@/types';

export default function ZonesAdminPage() {
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const id = cameraId ? Number(cameraId) : undefined;
      setZones(await api.listZones(id));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Зоны</h1>
          <p>Парковочные зоны и геометрия разметки</p>
        </div>
        <Button onClick={load} disabled={loading}>{loading ? 'Загрузка...' : 'Обновить'}</Button>
      </div>

      <div className="filter-bar">
        <Field label="Camera ID">
          <Input value={cameraId} onChange={e => setCameraId(e.target.value)} placeholder="Все камеры" />
        </Field>
        <Button variant="ghost" onClick={load}>Применить</Button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="section-panel">
        <div className="table-header zones">
          <span>ID</span>
          <span>Камера</span>
          <span>Тип</span>
          <span>Места</span>
          <span>Занято</span>
          <span>Цена</span>
        </div>
        <div className="table-list">
          {zones.map(zone => (
            <div className="table-row zones" key={String(zone.id)}>
              <div>{String(zone.id)}</div>
              <div>{zone.camera_id}</div>
              <div>{zone.zone_type}</div>
              <div>{zone.capacity}</div>
              <div>{zone.occupied ?? '—'}</div>
              <div>{zone.pay}</div>
            </div>
          ))}
          {!loading && zones.length === 0 && <div className="empty-state">Зоны не найдены</div>}
        </div>
      </div>
    </section>
  );
}
