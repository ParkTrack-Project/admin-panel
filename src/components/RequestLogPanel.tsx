import { useRequestLog } from '@/api/requestLog';
import { Button } from './UiKit';
import { maskBearerHeader, maskTokenLast4 } from '@/utils/secret';
import { useStore } from '@/store/useStore';

export default function RequestLogPanel() {
  const { entries, clear } = useRequestLog();
  const { token } = useStore();

  return (
    <div className="reqlog">
      <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
        <h4>Request log</h4>
        <Button variant="ghost" onClick={clear}>Очистить</Button>
      </div>

      {/* Diagnostics */}
      <div className="item" style={{marginBottom:8}}>
        <div className="small"><b>Auth:</b> {token ? `Bearer ${maskTokenLast4(token)}` : '—'}</div>
      </div>

      <div className="list">
        {entries.map(e=>(
          <div key={e.id} className="item">
            <div className="small">
              {new Date(e.ts).toLocaleTimeString()} • <b>{e.method}</b> {e.url}
            </div>

            {e.headers && (
              <>
                <div className="small" style={{marginTop:6}}>Headers:</div>
                <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(maskHeaders(e.headers), null, 2)}</pre>
              </>
            )}

            {e.body && (
              <>
                <div className="small">Body:</div>
                <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(e.body, null, 2)}</pre>
              </>
            )}
            {e.response && (
              <>
                <div className="small">Response:</div>
                <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(e.response, null, 2)}</pre>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function maskHeaders(h: Record<string,string>) {
  const out: Record<string,string> = {...h};
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === 'authorization') {
      out[k] = maskBearerHeader(out[k]);
    }
  }
  return out;
}
