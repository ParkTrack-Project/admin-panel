import { FormEvent, useState } from 'react';
import { api } from '@/api/client';
import { useSessionStore } from '@/auth/sessionStore';
import { navigate } from '@/router/routes';
import { Button, Field, Input } from '@/components/UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const session = useSessionStore();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetInfo, setResetInfo] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);

  const isRegister = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const response = isRegister
        ? await api.auth.register({ email, password, full_name: fullName || undefined, phone: phone || undefined })
        : await api.auth.login({ login: email, password });

      session.setSession({
        accessToken: response.access_token,
        user: {
          ...response.user,
          permissions: response.user.permissions ?? [],
          partner_memberships: response.user.partner_memberships ?? []
        }
      });
      navigate('dashboard');
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  function enterDemoMode() {
    session.startDemoSession();
    navigate('dashboard');
  }

  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    const targetEmail = (resetEmail || email).trim();
    if (!targetEmail) {
      notifyError('Укажите email для сброса пароля.');
      return;
    }

    setResetLoading(true);
    setError(undefined);
    setResetInfo(undefined);
    try {
      const response = await api.auth.requestPasswordReset({ email: targetEmail });
      setResetEmail(targetEmail);
      if (response.reset_token) {
        setResetToken(response.reset_token);
        setResetInfo('Тестовый reset-token получен. Введите новый пароль и подтвердите сброс.');
      } else {
        setResetInfo('Если email есть в системе, ссылка для сброса будет отправлена.');
      }
      notifySuccess('Запрос на сброс пароля создан.');
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      notifyError(message);
    } finally {
      setResetLoading(false);
    }
  }

  async function confirmPasswordReset(e: FormEvent) {
    e.preventDefault();
    if (!resetToken.trim()) {
      notifyError('Введите reset-token.');
      return;
    }
    if (resetNewPassword.length < 6) {
      notifyError('В пароле должно быть не менее 6 символов.');
      return;
    }

    setResetLoading(true);
    setError(undefined);
    try {
      await api.auth.confirmPasswordReset({
        token: resetToken.trim(),
        new_password: resetNewPassword
      });
      setEmail(resetEmail || email);
      setPassword('');
      setResetOpen(false);
      setResetToken('');
      setResetNewPassword('');
      setResetInfo(undefined);
      notifySuccess('Пароль обновлён. Войдите с новым паролем.');
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      notifyError(message);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <div className="brand-block auth-brand">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">ParkTrack</div>
            <div className="brand-subtitle">{isRegister ? 'Регистрация' : 'Вход'}</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </Field>

          {isRegister && (
            <>
              <Field label="Имя">
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иван Петров" />
              </Field>
              <Field label="Телефон">
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+79991234567" />
              </Field>
            </>
          )}

          <Field label="Пароль">
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          {error && <div className="notice error">{error}</div>}

          <Button type="submit" disabled={loading || !email || !password}>
            {loading ? 'Проверка...' : isRegister ? 'Создать аккаунт' : 'Войти'}
          </Button>
        </form>

        {!isRegister && (
          <div className="auth-reset-panel">
            <button
              type="button"
              className="auth-reset-toggle"
              onClick={() => {
                setResetOpen(value => !value);
                setResetEmail(resetEmail || email);
              }}
            >
              Сбросить пароль
            </button>

            {resetOpen && (
              <div className="auth-reset-content">
                <form className="auth-form" onSubmit={requestPasswordReset}>
                  <Field label="Email для сброса">
                    <Input
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                    />
                  </Field>
                  <Button type="submit" variant="ghost" disabled={resetLoading || !resetEmail}>
                    Получить reset-token
                  </Button>
                </form>

                <form className="auth-form" onSubmit={confirmPasswordReset}>
                  <Field label="Reset-token">
                    <Input
                      value={resetToken}
                      onChange={e => setResetToken(e.target.value)}
                      placeholder="token"
                      required
                    />
                  </Field>
                  <Field label="Новый пароль">
                    <Input
                      type="password"
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      placeholder="Минимум 6 символов"
                      required
                    />
                  </Field>
                  {resetInfo && <div className="notice warning">{resetInfo}</div>}
                  <Button type="submit" disabled={resetLoading || !resetToken || !resetNewPassword}>
                    Обновить пароль
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}

        <div className="auth-actions">
          <Button variant="ghost" onClick={() => navigate(isRegister ? 'login' : 'register')}>
            {isRegister ? 'У меня уже есть аккаунт' : 'Зарегистрироваться'}
          </Button>
          <Button variant="ghost" onClick={enterDemoMode}>
            Dev-вход
          </Button>
        </div>
      </section>
    </div>
  );
}
