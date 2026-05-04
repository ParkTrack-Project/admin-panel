import { create } from 'zustand';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

export type FeedbackNotice = {
  id: number;
  tone: FeedbackTone;
  message: string;
};

export type ConfirmTone = 'default' | 'danger';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  resolve: (value: boolean) => void;
};

type ConfirmOptions = Omit<ConfirmDialogState, 'resolve'>;

type FeedbackState = {
  notices: FeedbackNotice[];
  confirmDialog?: ConfirmDialogState;
  notify: (tone: FeedbackTone, message: string) => number;
  success: (message: string) => number;
  error: (message: string) => number;
  warning: (message: string) => number;
  info: (message: string) => number;
  dismiss: (id: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
};

let nextNoticeId = 1;

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  notices: [],

  notify(tone, message) {
    const id = nextNoticeId++;
    set(state => ({
      notices: [...state.notices, { id, tone, message }]
    }));
    return id;
  },

  success(message) {
    return get().notify('success', message);
  },

  error(message) {
    return get().notify('error', message);
  },

  warning(message) {
    return get().notify('warning', message);
  },

  info(message) {
    return get().notify('info', message);
  },

  dismiss(id) {
    set(state => ({
      notices: state.notices.filter(notice => notice.id !== id)
    }));
  },

  confirm(options) {
    return new Promise<boolean>((resolve) => {
      set({
        confirmDialog: {
          ...options,
          resolve
        }
      });
    });
  },

  resolveConfirm(value) {
    const dialog = get().confirmDialog;
    if (!dialog) return;
    dialog.resolve(value);
    set({ confirmDialog: undefined });
  }
}));
