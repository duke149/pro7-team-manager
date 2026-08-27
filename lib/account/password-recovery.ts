const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateRecoveryEmail(value: unknown):
  | { ok: true; email: string }
  | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "Email không hợp lệ." };
  const email = value.trim().toLocaleLowerCase("en-US");
  return email.length > 3 && email.length <= 254 && EMAIL.test(email)
    ? { ok: true, email }
    : { ok: false, message: "Email không hợp lệ." };
}

export function validateResetPassword(password: unknown, confirmation: unknown):
  | { ok: true; password: string }
  | { ok: false; message: string } {
  if (typeof password !== "string" || password.length < 12 || password.length > 72) {
    return { ok: false, message: "Mật khẩu phải có từ 12 đến 72 ký tự." };
  }
  if (!/[a-zà-ỹ]/iu.test(password) || !/\d/u.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
    return { ok: false, message: "Mật khẩu cần có chữ, số và ký tự đặc biệt." };
  }
  if (password !== confirmation) return { ok: false, message: "Mật khẩu xác nhận không khớp." };
  return { ok: true, password };
}

export function passwordRecoveryRedirect(origin: string): string {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) throw new Error("Invalid recovery origin");
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Invalid recovery origin");
  const redirect = new URL("/auth/callback", url.origin);
  redirect.searchParams.set("next", "/account/reset-password");
  return redirect.toString();
}
