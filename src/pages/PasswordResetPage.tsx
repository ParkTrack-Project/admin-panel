import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Button, Field, Input } from '@/components/UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { navigate } from '@/router/routes';

export default function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [info, setInfo] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);

  useEffect(() => {
    const [, queryString = ''] = window.location.hash.split('?');
    const params = new URLSearchParams(queryString);
    const tokenFromLink = params.get('reset_token') || params.get('token');
    const emailFromLink = params.get('email');

    if (tokenFromLink) {
      setToken(tokenFromLink);
      setInfo('Введите новый пароль для завершения сброса.');
    }
    if (emailFromLink) setEmail(emailFromLink);
  }, []);

  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    const targetEmail = email.trim();
    if (!targetEmail) {
      notifyError('Укажите email для сброса пароля.');
      return;
    }

    setRequestLoading(true);
    setError(undefined);
    setInfo(undefined);
    try {
      const response = await api.auth.requestPasswordReset({ email: targetEmail });
      if (response.reset_token) {
        setToken(response.reset_token);
        setInfo('Тестовый reset-token получен. Введите новый пароль и подтвердите сброс.');
      } else {
        setInfo('Если email есть в системе, ссылка для сброса отправлена на почту.');
      }
      notifySuccess('Запрос на сброс пароля создан.');
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      notifyError(message);
    } finally {
      setRequestLoading(false);
    }
  }

  async function confirmPasswordReset(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      notifyError('Введите reset-token.');
      return;
    }
    if (newPassword.length < 6) {
      notifyError('В пароле должно быть не менее 6 символов.');
      return;
    }

    setConfirmLoading(true);
    setError(undefined);
    try {
      await api.auth.confirmPasswordReset({
        token: token.trim(),
        new_password: newPassword
      });
      setNewPassword('');
      setToken('');
      setInfo(undefined);
      notifySuccess('Пароль обновлён. Войдите с новым паролем.');
      navigate('login');
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      notifyError(message);
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <div className="brand-block auth-brand">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">ParkTrack</div>
            <div className="brand-subtitle">Сброс пароля</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={requestPasswordReset}>
          <p className="auth-helper-text">Укажите email, чтобы получить ссылку для восстановления доступа.</p>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </Field>
          <Button type="submit" variant="ghost" disabled={requestLoading || !email}>
            {requestLoading ? 'Отправка...' : 'Отправить ссылку'}
          </Button>
        </form>

        <form className="auth-form auth-reset-confirm-form" onSubmit={confirmPasswordReset}>
          <Field label="Reset-token">
            <Input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="token"
              required
            />
          </Field>
          <Field label="Новый пароль">
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
            />
          </Field>
          {info && <div className="notice warning">{info}</div>}
          {error && <div className="notice error">{error}</div>}
          <Button type="submit" disabled={confirmLoading || !token || !newPassword}>
            {confirmLoading ? 'Обновление...' : 'Обновить пароль'}
          </Button>
        </form>

        <div className="auth-actions">
          <Button variant="ghost" onClick={() => navigate('login')}>К входу</Button>
          <Button variant="ghost" onClick={() => navigate('register')}>Зарегистрироваться</Button>
        </div>
      </section>
    </div>
  );
}
