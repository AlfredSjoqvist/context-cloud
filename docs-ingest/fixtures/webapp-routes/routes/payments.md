# Payment route security

Payment route handlers **must** verify the Stripe webhook signature before parsing the request body for any incoming event.

Payment route handlers **must not** log raw card numbers, CVV codes, or PAN values at any log level.

Payment route handlers **must** require an authenticated user session for all non-webhook endpoints under /payments.

Payment route handlers **should** return HTTP 422 when the body fails amount or currency validation.
