# `send-web-push`

Internal Supabase Edge Function that claims PRO7 push-delivery jobs, sends Web Push with VAPID, and settles every device independently.

Required secrets:

- `PRO7_PUSH_INTERNAL_SECRET` — at least 32 characters; must match the Vault secret used by `private.request_push_worker()`.
- `PRO7_VAPID_SUBJECT` — a `mailto:` or HTTPS contact URI.
- `PRO7_VAPID_PUBLIC_KEY`
- `PRO7_VAPID_PRIVATE_KEY`

Optional configuration:

- `PRO7_PUSH_BATCH_SIZE` — integer from 1 to 100; defaults to 50.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Deploy this function with JWT verification disabled because it is authenticated by the dedicated internal secret, not a user JWT:

```sh
supabase functions deploy send-web-push --no-verify-jwt
```

The endpoint accepts only `POST`, `application/json`, the exact body `{"source":"database"}`, and the `x-pro7-push-secret` header. It never returns subscription endpoints, encryption keys, user identifiers, or provider error details.
