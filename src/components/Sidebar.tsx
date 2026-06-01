import { useStore } from '@/store/useStore';
import { Button, Field, Input, Select, Textarea } from './UiKit';
import { useState, useEffect } from 'react';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { formatZoneLocationType, parseZoneLocationType, ZONE_LOCATION_TYPES, ZONE_LOCATION_TYPE_LABELS } from '@/types';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select';
}

export default function Sidebar() {
  const s = useStore();
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);
  const notifyInfo = useFeedbackStore(state => state.info);
  const confirmAction = useFeedbackStore(state => state.confirm);
  const zone = s.zones.find(z => String(z.id) === String(s.activeZoneId));
  const camera = s.cameraMeta;
  
  const [cameraTitle, setCameraTitle] = useState(camera?.title || '');
  const [cameraSource, setCameraSource] = useState(camera?.source || '');
  const [cameraCalib, setCameraCalib] = useState('');
  const [cameraIsActive, setCameraIsActive] = useState(camera?.is_active !== false);

  useEffect(() => {
    if (s.cameraId && !s.cameraMeta) {
      const id = parseInt(s.cameraId, 10);
      if (!isNaN(id)) {
        s.loadCameraMeta(id);
      }
    }
    if (s.cameraId && s.zones.length === 0) {
      s.loadZones();
    }
  }, [s.cameraId]);

  useEffect(() => {
    if (camera) {
      setCameraTitle(camera.title || '');
      setCameraSource(camera.source || '');
      setCameraCalib(camera.calib ? JSON.stringify(camera.calib, null, 2) : '');
      setCameraIsActive(camera.is_active !== false);
    }
  }, [camera]);

  async function saveCamera() {
    if (!camera) return;
    let calibParsed: any = null;
    if (cameraCalib.trim()) {
      try {
        calibParsed = JSON.parse(cameraCalib);
      } catch (e) {
        notifyError('Ошибка парсинга JSON в calib.');
        return;
      }
    }
    const ok = await s.saveCamera(camera.camera_id, {
      title: cameraTitle,
      source: cameraSource,
      calib: calibParsed,
      is_active: cameraIsActive
    });
    if (ok) {
      notifySuccess('Настройки камеры сохранены.');
    } else {
      notifyError(useStore.getState().error || 'Не удалось сохранить камеру.');
    }
  }

  function startDrawZone() {
    s.addZone();
    notifyInfo('Режим создания зоны включён.');
  }
  function finishEditing() {
    s.setTool('select');
    notifyInfo('Редактирование полигона завершено.');
  }

  function openCameraOnMap() {
    s.setViewMode('cameraMapSelector');
  }

  function openZoneOnMap() {
    if (!zone) return;
    s.setViewMode('zoneMapSelector');
  }

  async function refreshZones() {
    const ok = await s.loadZones();
    if (ok) {
      notifySuccess('Список зон обновлён.');
    } else {
      notifyError(useStore.getState().error || 'Не удалось обновить зоны.');
    }
  }

  async function saveActiveZone() {
    if (!zone) return;
    const ok = await s.saveZone(zone.id);
    if (ok) {
      notifySuccess('Зона сохранена.');
    } else {
      notifyError(useStore.getState().error || 'Не удалось сохранить зону.');
    }
  }

  async function removeActiveZone() {
    if (!zone) return;
    const confirmed = await confirmAction({
      title: 'Удалить зону?',
      message: `Зона #${String(zone.id)} будет удалена из списка и backend, если она уже сохранена.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });
    if (!confirmed) return;
    const ok = await s.removeZone(zone.id);
    if (ok) {
      notifySuccess('Зона удалена.');
    } else {
      notifyError(useStore.getState().error || 'Не удалось удалить зону.');
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        startDrawZone();
        return;
      }

      if (key === 'escape') {
        event.preventDefault();
        if (s.tool === 'drawZone') {
          s.zoneDraftClear();
          notifyInfo('Рисование зоны отменено.');
        } else {
          s.setTool('select');
          notifyInfo('Режим выбора включён.');
        }
        return;
      }

      if (!zone) return;

      if (key === 'e') {
        event.preventDefault();
        s.setTool('editZone');
        notifyInfo('Редактирование полигона включено.');
        return;
      }

      if (key === 's') {
        event.preventDefault();
        saveActiveZone();
        return;
      }

      if (key === 'm') {
        event.preventDefault();
        openZoneOnMap();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zone?.id, s.tool, s.zoneDraft?.length]);

  return (
    <div className="sidebar">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="badge">
          Camera: {s.cameraMeta ? `${s.cameraMeta.camera_id} — ${s.cameraMeta.title}` : (s.cameraId || '—')}
        </div>
        <div className="small">Tool: {s.tool}</div>
      </div>

      <hr/>

      {camera && (
        <>
          <h4>Настройки камеры</h4>
          <Field label="Title">
            <Input 
              value={cameraTitle}
              onChange={e => setCameraTitle(e.target.value)}
              placeholder="Название камеры"
            />
          </Field>
          <Field label="Source (видеопоток)">
            <Input 
              value={cameraSource}
              onChange={e => setCameraSource(e.target.value)}
              placeholder="https://... или rtsp://..."
            />
          </Field>
          <Field label="Calib (JSON)">
            <Textarea 
              value={cameraCalib}
              onChange={e => setCameraCalib(e.target.value)}
              placeholder='{"image_width": 1920, ...}'
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>
          <Field label="Is Active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input 
                type="checkbox"
                checked={cameraIsActive}
                onChange={e => setCameraIsActive(e.target.checked)}
              />
              <span className="small">Активна</span>
            </label>
          </Field>
          <div className="labeler-action-grid compact">
            <Button onClick={saveCamera}>Сохранить камеру</Button>
          </div>
          <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>
            <div>Создано: {formatDate(camera.created_at)}</div>
            <div>Обновлено: {formatDate(camera.updated_at)}</div>
          </div>
          <hr/>
        </>
      )}

      <div className="labeler-action-stack">
        <Button onClick={startDrawZone} title="N">
          + Добавить зону
        </Button>
        <Button variant="ghost" onClick={openCameraOnMap}>
          Отметить камеру на карте
        </Button>
        {s.tool === 'drawZone' && s.zoneDraft && s.zoneDraft.length > 0 && (
          <Button
            variant="danger"
            onClick={() => {
              s.zoneDraftClear();
              notifyInfo('Рисование зоны отменено.');
            }}
          >
            Отменить рисование
          </Button>
        )}
        <Button variant="ghost" onClick={refreshZones}>Обновить зоны</Button>
      </div>

      <h4>Зоны</h4>
      <div className="list">
        {s.zones.map(z => (
          <div key={String(z.id)} className={`item ${String(s.activeZoneId)===String(z.id) ? 'active':''}`} onClick={()=>s.selectZone(z.id)}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <div>{String(z.id)}</div>
              <span className="badge">{z.zone_type}</span>
            </div>
            <div className="small">
              мест: {z.capacity} • цена: {z.pay}
            </div>
            <div className="small">
              {formatZoneLocationType(z.location_type)} • {z.is_active === false ? 'inactive' : 'active'}
            </div>
          </div>
        ))}
      </div>

      {zone && (
        <>
          <hr/>
          <h4>Свойства зоны</h4>
          <Field label="Тип зоны">
            <Select value={zone.zone_type} onChange={e=>s.updateZone(zone.id,{zone_type:e.target.value as any})}>
              <option value="standard">standard</option>
              <option value="parallel">parallel</option>
              <option value="disabled">disabled</option>
            </Select>
          </Field>
          <Field label="Вместимость">
            <Input type="number" min={1} value={zone.capacity}
              onChange={e=>{
                const val = parseInt(e.target.value||'1',10);
                s.updateZone(zone.id,{capacity: Math.max(1, val)});
              }}/>
          </Field>
          <Field label="Цена">
            <Input type="number" min={0} value={zone.pay}
              onChange={e=>s.updateZone(zone.id,{pay: parseInt(e.target.value||'0',10)})}/>
          </Field>
          <Field label="Тип расположения">
            <Select
              value={zone.location_type ?? ''}
              onChange={e=>s.updateZone(zone.id,{location_type: parseZoneLocationType(e.target.value)})}
            >
              <option value="">Не задан</option>
              {ZONE_LOCATION_TYPES.map(locationType => (
                <option key={locationType} value={locationType}>{ZONE_LOCATION_TYPE_LABELS[locationType]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Флаги">
            <div className="zone-flags-grid">
              <label className="zone-flag-toggle">
                <input
                  type="checkbox"
                  checked={zone.is_active !== false}
                  onChange={e=>s.updateZone(zone.id,{is_active: e.target.checked})}
                />
                <span className="small">Активна</span>
              </label>
              <label className="zone-flag-toggle">
                <input
                  type="checkbox"
                  checked={zone.is_private === true}
                  onChange={e=>s.updateZone(zone.id,{is_private: e.target.checked})}
                />
                <span className="small">Частная</span>
              </label>
              <label className="zone-flag-toggle">
                <input
                  type="checkbox"
                  checked={zone.is_accessible === true}
                  onChange={e=>s.updateZone(zone.id,{is_accessible: e.target.checked})}
                />
                <span className="small">Инвалидная</span>
              </label>
            </div>
          </Field>
          <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>
            <div>Создано: {formatDate(zone.created_at)}</div>
            <div>Обновлено: {formatDate(zone.updated_at)}</div>
          </div>

          <div className="labeler-action-grid">
            <Button onClick={()=>s.setTool('editZone')} title="E">Редактировать полигон</Button>
            <Button variant="ghost" onClick={finishEditing} title="Esc">Готово</Button>
          </div>
          <div className="labeler-action-grid">
            <Button onClick={saveActiveZone} title="S">Сохранить зону</Button>
            <Button variant="danger" onClick={removeActiveZone}>Удалить зону</Button>
          </div>
          <div className="labeler-action-grid compact">
            <Button variant="ghost" onClick={openZoneOnMap} title="M">
              Геометрия на карте
            </Button>
          </div>
        </>
      )}

      {s.tool === 'drawZone' && (
        <>
          <hr/>
          <div className="small" style={{opacity:0.8}}>
            Режим рисования зоны: кликните 4 точки на изображении, чтобы замкнуть четырёхугольник.
          </div>
        </>
      )}
    </div>
  );
}
