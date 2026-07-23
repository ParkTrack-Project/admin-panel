import { useStore } from '@/store/useStore';
import { apiConfig, api } from '@/api/client';
import { useSessionStore } from '@/auth/sessionStore';
import { Button, Field, Input, FilePicker } from './UiKit';
import { useEffect, useState, useCallback, useRef } from 'react';
import { navigate } from '@/router/routes';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import type { CameraSnapshotMode } from '@/api/cameras';
import {
  CAMERA_SNAPSHOT_MODE_CONTENT,
  CameraSnapshotModeSelector,
  defaultCameraSnapshotMode
} from './CameraSnapshotModeSelector';

export default function TopBar() {
  const { apiBase, token, cameraId, viewMode, setImage, image, imageCameraId, setViewMode, labelerReturnRoute } = useStore();
  const sessionAccessToken = useSessionStore(state => state.accessToken);
  const canViewAnnotatedSnapshot = useSessionStore(state => state.hasPermission('admin.monitoring.view'));
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string>();
  const [snapshotMode, setSnapshotMode] = useState<CameraSnapshotMode>(
    () => defaultCameraSnapshotMode(canViewAnnotatedSnapshot)
  );
  const snapshotCacheRef = useRef<Map<string, Awaited<ReturnType<typeof loadImage>>>>(new Map());
  const snapshotRequestsRef = useRef<Map<string, Promise<Awaited<ReturnType<typeof loadImage>>>>>(new Map());
  const snapshotCacheGenerationRef = useRef(0);
  const cacheCameraIdRef = useRef(cameraId);
  const activeSnapshotModeRef = useRef(snapshotMode);
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);
  const effectiveToken = sessionAccessToken || token;
  activeSnapshotModeRef.current = snapshotMode;

  useEffect(() => {
    apiConfig.set(apiBase, effectiveToken);
  }, [apiBase, effectiveToken]);

  const clearSnapshotCache = useCallback(() => {
    snapshotCacheGenerationRef.current += 1;
    for (const cachedImage of snapshotCacheRef.current.values()) {
      revokeImage(cachedImage);
    }
    snapshotCacheRef.current.clear();
    snapshotRequestsRef.current.clear();
  }, []);

  useEffect(() => {
    if (cacheCameraIdRef.current === cameraId) return;
    clearSnapshotCache();
    cacheCameraIdRef.current = cameraId;
  }, [cameraId, clearSnapshotCache]);

  useEffect(() => {
    return () => clearSnapshotCache();
  }, [clearSnapshotCache]);

  useEffect(() => {
    if (!canViewAnnotatedSnapshot && snapshotMode === 'annotated') {
      setSnapshotMode('detection');
    }
  }, [canViewAnnotatedSnapshot, snapshotMode]);

  async function loadImageFromUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    try {
      clearSnapshotCache();
      const img = await loadImage(url);
      setImage(img, cameraId || undefined);
      fitToView(img);
      notifySuccess('Изображение открыто.');
    } catch (error: any) {
      notifyError(String(error?.message || 'Не удалось открыть изображение.'));
    }
  }

  const loadByCameraId = useCallback(async (
    targetMode: CameraSnapshotMode = snapshotMode,
    force = false
  ) => {
    if (!cameraId) return;

    if (targetMode === 'annotated' && !canViewAnnotatedSnapshot) {
      setLoadingSnapshot(false);
      setSnapshotMode('detection');
      return;
    }

    const key = snapshotCacheKey(cameraId, targetMode);
    const cached = snapshotCacheRef.current.get(key);
    if (cached && !force) {
      setLoadingSnapshot(false);
      setSnapshotError(undefined);
      if (image?.url !== cached.url || imageCameraId !== cameraId) {
        setImage(cached, cameraId, { revokePrevious: false });
        fitToView(cached);
      }
      return;
    }

    setLoadingSnapshot(true);
    setSnapshotError(undefined);
    try {
      apiConfig.set(apiBase, effectiveToken);

      let request = snapshotRequestsRef.current.get(key);
      if (!request) {
        const cacheGeneration = snapshotCacheGenerationRef.current;
        request = api.getSnapshot(parseInt(cameraId, 10), targetMode).then(async snap => {
          if (!snap?.image_url) {
            throw new Error('API не вернул изображение для этой камеры.');
          }

          try {
            const loadedImage = await loadImage(snap.image_url);
            if (cacheGeneration !== snapshotCacheGenerationRef.current) {
              revokeImage(loadedImage);
              const cancellation = new Error('Snapshot request cancelled');
              cancellation.name = 'AbortError';
              throw cancellation;
            }
            const previous = snapshotCacheRef.current.get(key);
            if (previous?.url !== loadedImage.url) {
              revokeImage(previous);
            }
            snapshotCacheRef.current.set(key, loadedImage);
            return loadedImage;
          } catch (error) {
            revokeImage({ url: snap.image_url });
            throw error;
          }
        }).finally(() => {
          if (snapshotRequestsRef.current.get(key) === request) {
            snapshotRequestsRef.current.delete(key);
          }
        });
        snapshotRequestsRef.current.set(key, request);
      }

      const img = await request;
      if (
        useStore.getState().viewMode === 'labeler'
        && useStore.getState().cameraId === cameraId
        && activeSnapshotModeRef.current === targetMode
      ) {
        setImage(img, cameraId, { revokePrevious: false });
        fitToView(img);
      }
    } catch (error: any) {
      console.error('Error loading snapshot:', error);
      if (
        error?.name !== 'AbortError'
        && useStore.getState().viewMode === 'labeler'
        && useStore.getState().cameraId === cameraId
        && activeSnapshotModeRef.current === targetMode
      ) {
        const modeLabel = CAMERA_SNAPSHOT_MODE_CONTENT[targetMode].label;
        setSnapshotError(
          `Не удалось загрузить «${modeLabel}»: ${String(error?.message || error)}`
        );
      }
    } finally {
      if (
        useStore.getState().viewMode === 'labeler'
        && useStore.getState().cameraId === cameraId
        && activeSnapshotModeRef.current === targetMode
      ) {
        setLoadingSnapshot(false);
      }
    }
  }, [
    apiBase,
    cameraId,
    canViewAnnotatedSnapshot,
    effectiveToken,
    image?.url,
    imageCameraId,
    setImage,
    snapshotMode
  ]);

  function fitToView(img: { naturalWidth: number; naturalHeight: number; url: string }) {
    useStore.getState().setView(1, 0, 0);
  }

  const isLabeler = viewMode === 'labeler';

  function backToOrigin() {
    setImage(undefined);
    clearSnapshotCache();
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
        loadByCameraId(snapshotMode);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [viewMode, cameraId, snapshotMode, loadByCameraId]);

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

        {isLabeler && cameraId && (
          <div className="labeler-snapshot-controls">
            <CameraSnapshotModeSelector
              value={snapshotMode}
              canViewAnnotated={canViewAnnotatedSnapshot}
              onChange={setSnapshotMode}
              ariaLabel="Кадр для разметки"
            />
            <Button
              variant="ghost"
              onClick={() => loadByCameraId(snapshotMode, true)}
              disabled={loadingSnapshot}
            >
              {loadingSnapshot ? 'Загрузка...' : 'Обновить кадр'}
            </Button>
          </div>
        )}

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
                  clearSnapshotCache();
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
      {isLabeler && snapshotError && (
        <div className="notice warning labeler-snapshot-error">{snapshotError}</div>
      )}
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

function snapshotCacheKey(cameraId: string, mode: CameraSnapshotMode) {
  return `${cameraId}:${mode}`;
}

function revokeImage(image?: { url: string }) {
  if (image?.url.startsWith('blob:')) {
    URL.revokeObjectURL(image.url);
  }
}
