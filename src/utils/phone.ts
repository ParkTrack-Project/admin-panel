export const PHONE_VALIDATION_MESSAGE = 'Номер телефона должен содержать 10-15 цифр и может начинаться с +.';

const PHONE_ALLOWED_RE = /^\+?[0-9\s().-]+$/;

export function validateOptionalPhone(value: string) {
  const phone = value.trim();
  if (!phone) return undefined;

  const digits = phone.replace(/\D/g, '');
  if (!PHONE_ALLOWED_RE.test(phone) || digits.length < 10 || digits.length > 15) {
    return PHONE_VALIDATION_MESSAGE;
  }

  return undefined;
}
