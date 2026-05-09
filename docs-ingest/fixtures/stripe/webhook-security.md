# Stripe Webhook Security

This guide explains how to receive Stripe webhook events securely. Treating webhook
endpoints carelessly is one of the most common sources of severe security incidents
in payment integrations.

## Verifying Webhook Signatures

You **must** verify the signature on every webhook event Stripe sends to your
endpoint. Without verification, an attacker who learns your endpoint URL can forge
events and trick your application into creating refunds, marking fraudulent
charges as paid, or bypassing fulfilment checks.

### Using the Stripe SDK

The official Stripe SDK exposes a `stripe.webhooks.constructEvent()` helper. Pass
it three things: the raw request body, the value of the `Stripe-Signature`
header, and your endpoint's signing secret.

You **must not** parse the request body before passing it to `constructEvent()`.
The signature is computed over the exact raw bytes Stripe sent. Any reformatting
— including JSON pretty-printing or middleware that re-serialises the body —
will cause verification to fail and may force you to disable verification, which
is unsafe.

In Express, register a body parser specifically for the webhook route that
preserves the raw bytes:

```js
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);
```

Apply your normal `express.json()` middleware **after** this route, not before.

### Endpoint Signing Secret

Each endpoint has its own signing secret prefixed with `whsec_`. Treat it like
a password.

- **Never** commit the signing secret to source control.
- **Always** load it from environment variables or a secret manager.
- Rotate the secret immediately if you suspect it has been exposed.
- Use a different signing secret per environment (dev, staging, production).

If you operate multiple endpoints — for example, one for billing events and one
for Connect events — each must use its own signing secret. Do not share signing
secrets across endpoints.

## Responding to Events

Your endpoint **must** return a `2xx` status code within 30 seconds of receiving
a webhook. If Stripe does not receive a `2xx` response in time, it will treat
the delivery as failed and retry with exponential backoff for up to three days.

You **should not** perform long-running work synchronously inside the webhook
handler. Acknowledge the event quickly by writing it to a queue, then process
it in a background worker. This pattern keeps your endpoint within the 30-second
budget even when downstream systems are slow.

### Idempotency

Stripe may deliver the same event more than once. Your handler **must** be
idempotent: receiving the same event twice should produce the same outcome as
receiving it once. The simplest implementation is to record processed event IDs
in a database table with a unique constraint on the `event.id` column, and
short-circuit on duplicates.

Do not rely on event ordering. Stripe does not guarantee that events arrive in
the order they occurred — for example, a `charge.refunded` event may arrive
before the corresponding `charge.succeeded` event.

## Network Hardening

Webhook endpoints **must** be served over HTTPS in production. Stripe will not
deliver events to plain HTTP endpoints outside of local development.

If you operate in a strict network environment, restrict inbound traffic to the
endpoint by allowlisting Stripe's published webhook IP ranges. Do **not** use
Stripe's IP ranges as an authentication signal — signature verification is the
only authoritative check. IP allowlisting is a defence-in-depth measure, not a
substitute for verification.

### Logging

Never log the full request body of a webhook at INFO level or above. Webhook
payloads frequently contain partial card metadata, customer email addresses,
and billing addresses that are subject to PCI and privacy obligations. If you
need debug logging, log the event ID and event type only, and gate body
logging behind a DEBUG flag that is disabled in production.
