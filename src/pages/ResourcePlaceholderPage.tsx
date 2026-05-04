import { Button } from '@/components/UiKit';

export default function ResourcePlaceholderPage({
  title,
  subtitle,
  endpoints
}: {
  title: string;
  subtitle: string;
  endpoints: string[];
}) {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Button disabled>Создать</Button>
      </div>

      <div className="section-panel">
        <div className="table-header">
          <span>Контракт</span>
          <span>Статус</span>
        </div>
        <div className="table-list">
          {endpoints.map(endpoint => (
            <div className="table-row" key={endpoint}>
              <div>{endpoint}</div>
              <div><span className="status-pill paused">Ожидает backend</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
