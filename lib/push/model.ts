export type PushSubscriptionMutation =
  | Readonly<{
      action: "subscribe";
      endpoint: string;
      expirationTime: number | null;
      p256dh: string;
      auth: string;
    }>
  | Readonly<{ action: "unsubscribe"; endpoint: string }>;

export type PushSubscriptionValidation =
  | { ok: true; value: PushSubscriptionMutation }
  | { ok: false; field: string; message: string };
