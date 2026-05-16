import { FormEvent, useState } from 'react';
import { api } from '@/api/client';
import { useSessionStore } from '@/auth/sessionStore';
import { navigate } from '@/router/routes';
import { Button, Field, Input } from '@/components/UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { validateOptionalPhone } from '@/utils/phone';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const session = useSessionStore();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const notifyError = useFeedbackStore(state => state.error);

  const isRegister = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (isRegister) {
      const phoneError = validateOptionalPhone(phone);
      if (phoneError) {
        setError(phoneError);
        notifyError(phoneError);
        return;
      }
    }

    setLoading(true);

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
          <div className="auth-secondary-action">
            <button
              type="button"
              className="auth-reset-toggle"
              onClick={() => navigate('password-reset')}
            >
              Забыли пароль?
            </button>
          </div>
        )}

        <div className="auth-actions">
          <Button variant="ghost" onClick={() => navigate(isRegister ? 'login' : 'register')}>
            {isRegister ? 'У меня уже есть аккаунт' : 'Зарегистрироваться'}
          </Button>
        </div>
      </section>
    </div>
  );
}
