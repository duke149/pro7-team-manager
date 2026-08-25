export type PasswordValidation =
  | { ok: true }
  | { ok: false; code: "length" | "complexity" | "email" | "unchanged" };

type PasswordValidationInput = {
  password: string;
  email: string;
  temporaryPassword: string;
};

export function validateNewPassword({
  password,
  email,
  temporaryPassword,
}: PasswordValidationInput): PasswordValidation {
  if (password.length < 12) return { ok: false, code: "length" };
  if (
    !/[A-Z]/u.test(password) ||
    !/[a-z]/u.test(password) ||
    !/\d/u.test(password) ||
    !/[^A-Za-z0-9]/u.test(password)
  ) {
    return { ok: false, code: "complexity" };
  }

  const emailLocalPart = email.trim().toLocaleLowerCase().split("@", 1)[0];
  if (emailLocalPart && password.toLocaleLowerCase().includes(emailLocalPart)) {
    return { ok: false, code: "email" };
  }
  if (password === temporaryPassword) return { ok: false, code: "unchanged" };

  return { ok: true };
}
