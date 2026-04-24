import { Button } from '@/components/UiKit';
import { navigate } from '@/router/routes';

export default function AccessStatePage({
  title,
  subtitle,
  actionLabel = 'К обзору',
  actionRoute = 'dashboard'
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionRoute?: 'dashboard' | 'profile' | 'login';
}) {
  return (
    <section className="page-stack">
      <div className="section-panel access-state-panel">
        <h1 style={{ marginBottom: 8 }}>{title}</h1>
        <p className="small" style={{ fontSize: 14 }}>{subtitle}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Button onClick={() => navigate(actionRoute)}>{actionLabel}</Button>
        </div>
      </div>
    </section>
  );
}
