import { useEffect } from 'react';
import { Button } from '@/components/UiKit';
import { useFeedbackStore } from './feedbackStore';

const AUTO_DISMISS_MS = 4200;

export default function GlobalFeedbackHost() {
  const notices = useFeedbackStore(state => state.notices);
  const confirmDialog = useFeedbackStore(state => state.confirmDialog);
  const dismiss = useFeedbackStore(state => state.dismiss);
  const resolveConfirm = useFeedbackStore(state => state.resolveConfirm);

  useEffect(() => {
    if (!notices.length) return;

    const timers = notices.map((notice) => (
      window.setTimeout(() => dismiss(notice.id), AUTO_DISMISS_MS)
    ));

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [notices, dismiss]);

  return (
    <>
      <div className="feedback-toast-stack" aria-live="polite" aria-atomic="true">
        {notices.map(notice => (
          <div key={notice.id} className={`feedback-toast ${notice.tone}`}>
            <div className="feedback-toast-message">{notice.message}</div>
            <button
              type="button"
              className="feedback-toast-close"
              onClick={() => dismiss(notice.id)}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {confirmDialog && (
        <div className="feedback-dialog-backdrop" role="presentation">
          <div
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
          >
            <h2 id="feedback-dialog-title">{confirmDialog.title}</h2>
            <p>{confirmDialog.message}</p>
            <div className="feedback-dialog-actions">
              <Button variant="ghost" onClick={() => resolveConfirm(false)}>
                {confirmDialog.cancelLabel ?? 'Отмена'}
              </Button>
              <Button
                variant={confirmDialog.tone === 'danger' ? 'danger' : 'primary'}
                onClick={() => resolveConfirm(true)}
              >
                {confirmDialog.confirmLabel ?? 'Подтвердить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
