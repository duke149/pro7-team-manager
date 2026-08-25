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
  if (password === temporaryPassword) return { ok: false, code: "unchanged" };
  if (password.length < 12) return { ok: false, code: "length" };
  if (
    !/[A-Z]/u.test(password) ||
    !/[a-z]/u.test(password) ||
    !/\d/u.test(password) ||
    !/[^A-Za-z0-9]/u.test(password)
  ) {
    return { ok: false, code: "complexity" };
  }

  const emailLocalPart = email
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .split("@", 1)[0];
  if (
    emailLocalPart &&
    password.normalize("NFKC").toLowerCase().includes(emailLocalPart)
  ) {
    return { ok: false, code: "email" };
  }

  return { ok: true };
}
