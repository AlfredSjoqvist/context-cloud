# cookie-parser — Security Guidelines for Express Cookie Handling

`cookie-parser` is the standard Express middleware that parses the `Cookie`
header into a `req.cookies` object and, when configured with a secret,
populates `req.signedCookies` with the verified subset. Because cookies are
the primary transport for session state in most Express applications, the
middleware sits directly on the application's authentication boundary. The
rules below collect the configuration and validation steps every Express
application using `cookie-parser` is expected to follow.

## Signed cookies and the secret argument

`cookieParser()` accepts a secret (or array of secrets) as its first argument.
Without a secret, the `req.signedCookies` object is empty and any cookie set
with `res.cookie(name, value, { signed: true })` is silently demoted to an
unsigned cookie on the response and rejected on subsequent requests.

Code **must** pass a secret to `cookieParser(secret)` whenever the application
issues signed cookies, otherwise the `signed: true` option on `res.cookie` is
a no-op and the resulting cookies carry no integrity guarantee. Code **must
not** read `req.cookies['session']` for any value that participates in
authentication — sensitive cookies belong in `req.signedCookies`, where the
middleware has already verified the signature.

## Cookie attributes for session values

`cookie-parser` only parses inbound cookies; the `Set-Cookie` response header
is produced by `res.cookie`. The combination of `cookie-parser` plus
`res.cookie` is the typical session surface, and the response-side attributes
are what determine whether the session value can be stolen by client-side
JavaScript or by a network attacker on a downgrade.

Code **must** set `httpOnly: true`, `secure: true`, and `sameSite: 'strict'`
on every response cookie that carries session state, because any one of those
flags being unset opens a documented exfiltration path. Code **must not** rely
on the framework defaults for `httpOnly` or `secure` — Express does not set
either flag by default, and a missing flag is silently accepted by every
browser.

## Trust boundary on `req.cookies`

`req.cookies` is an unvalidated mirror of whatever the client sent in its
`Cookie` header. The cookie names, values, and order are entirely under
attacker control on any request that reaches the middleware.

Code **must not** trust `req.cookies` without verifying signatures for
sensitive values — only `req.signedCookies` carries the middleware's integrity
check. Code **should** validate cookie names against a strict allowlist
(`/^[A-Za-z0-9_.-]+$/` or stricter) before reading them, because the parser
itself accepts any RFC 6265 token and does not enforce an application-specific
naming convention.

## Secret rotation and the secret-array form

`cookie-parser` accepts an array of secrets as its first argument. The first
secret in the array is used to sign new cookies, and every secret in the array
is tried in order when verifying inbound signatures. The array form is the
intended path for rotating a secret without invalidating every active session.

Code **should** rotate the cookie-parser secret on a documented cadence by
prepending a new secret to the array and removing the oldest entry once all
sessions signed under it have expired. Code **must not** reduce the secret
array to a single value mid-rotation — every value still in flight must remain
verifiable for at least the configured session lifetime. Code **should not**
hard-code the secret in source; it must come from an environment variable or
a secret manager so that rotation does not require a code change.

## Logging and error handling

Like any authentication-adjacent middleware, `cookie-parser` interacts with
values that carry session identifiers. Those values are bearer tokens — a
copy of `req.cookies['session']` in a log line is functionally equivalent to
a copy of the session itself.

Code **must not** log the raw values of cookies that carry session state at
any verbosity level. Code **should** redact the `Cookie` and `Set-Cookie`
headers before passing the request or response to a structured logger.
