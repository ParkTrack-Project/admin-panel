import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/auth/sessionStore';
import { api } from '@/api/client';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { Button, Field, Input } from '@/components/UiKit';

export default function ProfilePage() {
  const user = useSessionStore(s => s.user);
  const accessToken = useSessionStore(s => s.accessToken);
  const currentPartnerId = useSessionStore(s => s.currentPartnerId);
  const setSession = useSessionStore(s => s.setSession);
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyInfo = useFeedbackStore(state => state.info);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | undefined>();
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const role = user?.global_role ?? '—';
  const memberships = user?.partner_memberships ?? [];
  const isDevSession = accessToken === 'dev-admin-token';
  const hasProfileChanges = useMemo(() => (
    profileForm.fullName.trim() !== (user?.full_name ?? '')
    || profileForm.phone.trim() !== (user?.phone ?? '')
  ), [profileForm, user?.full_name, user?.phone]);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      fullName: user.full_name ?? '',
      phone: user.phone ?? ''
    });
  }, [user?.user_id, user?.full_name, user?.phone]);

  if (!user) {
    return (
      <section className="page-stack">
        <div className="empty-state">Профиль пока недоступен. Войдите в систему ещё раз.</div>
      </section>
    );
  }

  const currentUser = user;

  async function onSaveProfile() {
    const fullName = profileForm.fullName.trim();
    const phone = profileForm.phone.trim();

    if (!fullName) {
      setProfileError('Имя не должно быть пустым.');
      return;
    }

    if (fullName.length > 200) {
      setProfileError('Имя должно быть короче 200 символов.');
      return;
    }

    setProfileSaving(true);
    setProfileError(undefined);

    try {
      const patch = {
        full_name: fullName,
        phone: phone || null
      };

      if (isDevSession) {
        setSession({
          accessToken,
          currentPartnerId,
          user: {
            ...currentUser,
            full_name: patch.full_name,
            phone: patch.phone,
            updated_at: new Date().toISOString()
          }
        });
        notifyInfo('Профиль обновлён локально в dev-сессии.');
      } else {
        const updated = await api.users.updateMe(patch);
        setSession({
          accessToken,
          currentPartnerId,
          user: {
            ...currentUser,
            user_id: updated.user_id,
            email: updated.email,
            full_name: updated.full_name,
            phone: updated.phone ?? null,
            global_role: updated.global_role ?? updated.global_roles?.[0] ?? currentUser.global_role,
            is_active: updated.is_active ?? currentUser.is_active,
            is_email_verified: updated.is_email_verified ?? currentUser.is_email_verified,
            created_at: updated.created_at ?? currentUser.created_at,
            updated_at: updated.updated_at ?? currentUser.updated_at,
            permissions: currentUser.permissions,
            partner_memberships: currentUser.partner_memberships
          }
        });
        notifySuccess('Профиль сохранён.');
      }
    } catch (error: any) {
      setProfileError(String(error?.message || error));
    } finally {
      setProfileSaving(false);
    }
  }

  async function onChangePassword() {
    if (!passwordForm.currentPassword.trim() && !isDevSession) {
      setPasswordError('Введите текущий пароль.');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Новый пароль должен содержать минимум 8 символов.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Подтверждение пароля не совпадает.');
      return;
    }

    setPasswordSaving(true);
    setPasswordError(undefined);

    try {
      if (isDevSession) {
        notifyInfo('Пароль в dev-сессии отмечен как обновлённый локально.');
      } else {
        await api.users.updatePassword({
          old_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword
        });
        notifySuccess('Пароль обновлён.');
      }

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error: any) {
      setPasswordError(String(error?.message || error));
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Профиль</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="details-grid">
        <Detail label="ID" value={user.user_id} />
        <Detail label="Имя" value={user.full_name || '—'} />
        <Detail label="Телефон" value={user.phone || '—'} />
        <Detail label="Глобальная роль" value={role} />
        <Detail label="Права" value={user.permissions.length} />
        <Detail label="Email verified" value={user.is_email_verified === false ? 'Нет' : 'Да'} />
        <Detail label="Статус" value={user.is_active === false ? 'Неактивен' : 'Активен'} />
        <Detail label="Создан" value={formatDate(user.created_at)} />
        <Detail label="Обновлён" value={formatDate(user.updated_at)} />
      </div>

      <div className="details-grid profile-panels-grid">
        <div className="section-panel profile-form-panel">
          <h2>Данные аккаунта</h2>
          <div className="profile-form-grid">
            <Field label="Email">
              <Input value={user.email} disabled />
            </Field>
            <Field label="Полное имя">
              <Input
                value={profileForm.fullName}
                onChange={e => {
                  setProfileError(undefined);
                  setProfileForm(prev => ({ ...prev, fullName: e.target.value }));
                }}
                placeholder="Введите имя"
              />
            </Field>
            <Field label="Телефон">
              <Input
                value={profileForm.phone}
                onChange={e => {
                  setProfileError(undefined);
                  setProfileForm(prev => ({ ...prev, phone: e.target.value }));
                }}
                placeholder="+79991234567"
              />
            </Field>
            <Field label="Текущий partner context">
              <Input value={currentPartnerId === undefined ? 'Все партнёры' : `#${currentPartnerId}`} disabled />
            </Field>
          </div>
          {profileError && <div className="notice error">{profileError}</div>}
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setProfileError(undefined);
                setProfileForm({
                  fullName: user.full_name ?? '',
                  phone: user.phone ?? ''
                });
              }}
              disabled={profileSaving || !hasProfileChanges}
            >
              Сбросить
            </Button>
            <Button onClick={onSaveProfile} disabled={profileSaving || !hasProfileChanges}>
              {profileSaving ? 'Сохранение...' : 'Сохранить профиль'}
            </Button>
          </div>
        </div>

        <div className="section-panel profile-form-panel">
          <h2>Смена пароля</h2>
          <div className="profile-form-grid">
            <Field label="Текущий пароль">
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={e => {
                  setPasswordError(undefined);
                  setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }));
                }}
                placeholder={isDevSession ? 'Не требуется в dev-сессии' : 'Введите текущий пароль'}
              />
            </Field>
            <Field label="Новый пароль">
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={e => {
                  setPasswordError(undefined);
                  setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }));
                }}
                placeholder="Минимум 8 символов"
              />
            </Field>
            <Field label="Подтверждение">
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={e => {
                  setPasswordError(undefined);
                  setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                }}
                placeholder="Повторите новый пароль"
              />
            </Field>
          </div>
          {passwordError && <div className="notice error">{passwordError}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button
              onClick={onChangePassword}
              disabled={passwordSaving || !passwordForm.newPassword || !passwordForm.confirmPassword}
            >
              {passwordSaving ? 'Обновление...' : 'Обновить пароль'}
            </Button>
          </div>
        </div>
      </div>

      <div className="section-panel">
        <h2>Партнёрские доступы</h2>
        <div className="table-list">
          {memberships.map(m => (
            <div className="table-row" key={m.partner_id}>
              <div>#{m.partner_id}</div>
              <div>{m.role}</div>
              <div>{m.read_scope}</div>
              <div>{m.write_scope}</div>
              <div>{m.delete_scope}</div>
            </div>
          ))}
          {memberships.length === 0 && <div className="empty-state">Нет партнёрских доступов</div>}
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-card">
      <div className="metric-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}
