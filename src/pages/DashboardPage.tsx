import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/UiKit';
import { navigate } from '@/router/routes';

type DashboardState = {
  health?: string;
  version?: string;
  cameras?: number;
  zones?: number;
  error?: string;
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [health, version, cameras, zones] = await Promise.allSettled([
          api.health(),
          api.version(),
          api.listCameras(),
          api.listZones()
        ]);

        if (cancelled) return;

        setState({
          health: health.status === 'fulfilled' ? health.value.status ?? 'unknown' : 'offline',
          version: version.status === 'fulfilled' ? version.value.api_version ?? version.value.version ?? 'unknown' : 'unknown',
          cameras: cameras.status === 'fulfilled' ? cameras.value.length : undefined,
          zones: zones.status === 'fulfilled' ? zones.value.length : undefined,
          error: [health, version, cameras, zones].some(r => r.status === 'rejected')
            ? 'Часть данных временно недоступна'
            : undefined
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Обзор</h1>
          <p>Операционный контур ParkTrack</p>
        </div>
        <Button onClick={() => navigate('cameras')}>К камерам</Button>
      </div>

      {state.error && <div className="notice warning">{state.error}</div>}

      <div className="metric-grid">
        <MetricCard label="API" value={loading ? '...' : state.health ?? 'unknown'} />
        <MetricCard label="Версия" value={state.version ?? 'unknown'} />
        <MetricCard label="Камеры" value={state.cameras ?? '—'} />
        <MetricCard label="Зоны" value={state.zones ?? '—'} />
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
