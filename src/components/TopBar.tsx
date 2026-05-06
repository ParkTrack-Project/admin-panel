import { useStore } from '@/store/useStore';
import { apiConfig, api } from '@/api/client';
import { useSessionStore } from '@/auth/sessionStore';
import { Button, Field, Input, FilePicker } from './UiKit';
import { useEffect, useState, useCallback, useRef } from 'react';
import { navigate } from '@/router/routes';

export default function TopBar() {
  const { apiBase, token, cameraId, viewMode, setImage, image, setViewMode, labelerReturnRoute } = useStore();
  const sessionAccessToken = useSessionStore(state => state.accessToken);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const currentBlobUrlRef = useRef<string | null>(null);
  const loadedCameraIdRef = useRef<string | null>(null);
  const effectiveToken = sessionAccessToken || token;

  useEffect(() => {
    apiConfig.set(apiBase, effectiveToken);
  }, [apiBase, effectiveToken]);

  async function loadImageFromUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    const img = await loadImage(url);
    setImage(img);
    fitToView(img);
  }

  const loadByCameraId = useCallback(async () => {
    if (!cameraId) return;
    
    // Prevent duplicate loads for the same camera
    if (loadedCameraIdRef.current === cameraId && image?.url) {
      return;
    }
    
    setLoadingSnapshot(true);
    try {
      apiConfig.set(apiBase, effectiveToken);
      const snap = await api.getSnapshot(parseInt(cameraId, 10));
      
      if (snap?.image_url) {
        // Clean up previous blob URL to prevent memory leaks
        if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
        }
        
        currentBlobUrlRef.current = snap.image_url;
        loadedCameraIdRef.current = cameraId;
        const img = await loadImage(snap.image_url);
        setImage(img);
        fitToView(img);
      } else {
        console.warn('Snapshot missing image_url, using fallback');
        const img = await loadImage('/sample.jpg');
        setImage(img);
        fitToView(img);
      }
    } catch (error) {
      console.error('Error loading snapshot:', error);
      try {
        const img = await loadImage('/sample.jpg');
        setImage(img);
        fitToView(img);
      } catch (fallbackError) {
        console.error('Error loading fallback image:', fallbackError);
      }
    } finally {
      setLoadingSnapshot(false);
    }
  }, [cameraId, apiBase, effectiveToken, setImage, image]);

  function fitToView(img: { naturalWidth: number; naturalHeight: number; url: string }) {
    useStore.getState().setView(1, 0, 0);
  }

  const isLabeler = viewMode === 'labeler';

  function backToOrigin() {
    if (labelerReturnRoute === 'zones') {
      navigate('zones');
      return;
    }
    setViewMode('cameras');
    navigate('cameras');
  }

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'labeler' || !cameraId) {
      loadedCameraIdRef.current = null;
    }
  }, [viewMode, cameraId]);

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
              {loadingSnapshot && <span className="small">Загрузка snapshot...</span>}
            </div>
          </Field>
        )}

        {isLabeler && (
          <Field label=" ">
            <FilePicker
              accept="image/*"
              onPick={async (f) => {
                const url = URL.createObjectURL(f);
                const img = await loadImage(url);
                setImage(img);
                fitToView(img);
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
