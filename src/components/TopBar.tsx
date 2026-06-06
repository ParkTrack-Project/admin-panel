import { useStore } from '@/store/useStore';
import { apiConfig, api } from '@/api/client';
import { useSessionStore } from '@/auth/sessionStore';
import { Button, Field, Input, FilePicker } from './UiKit';
import { useEffect, useState, useCallback } from 'react';
import { navigate } from '@/router/routes';
import { useFeedbackStore } from '@/feedback/feedbackStore';

export default function TopBar() {
  const { apiBase, token, cameraId, viewMode, setImage, image, imageCameraId, setViewMode, labelerReturnRoute } = useStore();
  const sessionAccessToken = useSessionStore(state => state.accessToken);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);
  const notifyWarning = useFeedbackStore(state => state.warning);
  const effectiveToken = sessionAccessToken || token;

  useEffect(() => {
    apiConfig.set(apiBase, effectiveToken);
  }, [apiBase, effectiveToken]);

  async function loadImageFromUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    try {
      const img = await loadImage(url);
      setImage(img, cameraId || undefined);
      fitToView(img);
      notifySuccess('Изображение открыто.');
    } catch (error: any) {
      notifyError(String(error?.message || 'Не удалось открыть изображение.'));
    }
  }

  const loadByCameraId = useCallback(async () => {
    if (!cameraId) return;
    
    if (image?.url && imageCameraId === cameraId) {
      return;
    }
    
    setLoadingSnapshot(true);
    try {
      apiConfig.set(apiBase, effectiveToken);
      const snap = await api.getSnapshot(parseInt(cameraId, 10));
      
      if (snap?.image_url) {
        const img = await loadImage(snap.image_url);
        setImage(img, cameraId);
        fitToView(img);
      } else {
        console.warn('Snapshot missing image_url, using fallback');
        const img = await loadImage('/sample.png');
        setImage(img, cameraId);
        fitToView(img);
        notifyWarning('Кадр с камеры недоступен, открыт тестовый кадр.');
      }
    } catch (error) {
      console.error('Error loading snapshot:', error);
      try {
        const img = await loadImage('/sample.png');
        setImage(img, cameraId);
        fitToView(img);
        notifyWarning('Не удалось загрузить кадр с камеры, открыт тестовый кадр.');
      } catch (fallbackError) {
        console.error('Error loading fallback image:', fallbackError);
        notifyError('Не удалось загрузить кадр с камеры и тестовый кадр.');
      }
    } finally {
      setLoadingSnapshot(false);
    }
  }, [cameraId, apiBase, effectiveToken, setImage, image, imageCameraId]);

  function fitToView(img: { naturalWidth: number; naturalHeight: number; url: string }) {
    useStore.getState().setView(1, 0, 0);
  }

  const isLabeler = viewMode === 'labeler';

  function backToOrigin() {
    setImage(undefined);
    if (labelerReturnRoute === 'zones') {
      navigate('zones');
      return;
    }
    setViewMode('cameras');
    navigate('cameras');
  }

  useEffect(() => {
    if (viewMode === 'labeler' && cameraId) {
      const timer = setTimeout(() => {
        loadByCameraId();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [viewMode, cameraId, loadByCameraId]);

  return (
    <div className="topbar">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 6, marginRight: 16 }}>
          <span className="badge">Разметка зон</span>
          {cameraId && (
            <Button variant="ghost" onClick={backToOrigin}>
              {labelerReturnRoute === 'zones' ? 'Назад к зоне' : 'Назад к камере'}
            </Button>
          )}
        </div>

        {isLabeler && (
          <Field label="Image URL">
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <Input
                style={{ minWidth: 320 }}
                value={imageUrlInput}
                onChange={e => setImageUrlInput(e.target.value)}
                placeholder="http://…/frame.jpg"
              />
              <Button onClick={loadImageFromUrl}>Открыть</Button>
              {loadingSnapshot && <span className="small">Загрузка кадра...</span>}
            </div>
          </Field>
        )}

        {isLabeler && (
          <Field label=" ">
            <FilePicker
              accept="image/*"
              onPick={async (f) => {
                try {
                  const url = URL.createObjectURL(f);
                  const img = await loadImage(url);
                  setImage(img, cameraId || undefined);
                  fitToView(img);
                  notifySuccess('Файл изображения открыт.');
                } catch (error: any) {
                  notifyError(String(error?.message || 'Не удалось открыть файл.'));
                }
              }}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

async function loadImage(url: string) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Image load error'));
  });
  return { url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}
