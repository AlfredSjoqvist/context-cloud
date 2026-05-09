# bcryptjs — Security Guidelines for Password Hashing

`bcryptjs` is a pure-JavaScript implementation of the bcrypt password-hashing
algorithm. It exposes the same hashing surface as the native `bcrypt` binding,
which means it inherits the same long-standing footguns. The notes below
collect the rules every caller of `bcrypt.hash`, `bcrypt.compare`, and
`bcrypt.genSalt` is expected to follow when the library is used to protect
authentication credentials.

## Input length and the 72-byte truncation

The bcrypt algorithm operates on at most 72 bytes of input. Bytes beyond that
position are silently discarded by the C reference implementation and by every
faithful port, including `bcryptjs`. Two passwords that share their first 72
bytes therefore hash to indistinguishable digests, regardless of any further
characters supplied by the user.

Code **must** hash inputs longer than 72 bytes through a fixed-length
preprocessing step (commonly an HMAC-SHA-256) before passing them to
`bcrypt.hash`, otherwise long-passphrase users silently lose entropy. Code
**must not** rely on `bcrypt.hash` to reject or detect over-length inputs —
bcryptjs accepts them without warning and simply discards the trailing bytes.

## Cost factor selection

The cost parameter passed to `bcrypt.genSalt` or to the second argument of
`bcrypt.hash` is a base-2 logarithm of the number of key-stretching iterations.
A cost of `10` corresponds to roughly 100 ms of CPU work on a modern server in
2024 and is no longer considered sufficient for password hashing.

Code **should** use a cost factor of at least `12` for any newly written call
to `bcrypt.hash` or `bcrypt.genSalt` in 2024 or later. Code **should not** ship
with the library default of `10`, which OWASP's password-storage guidance
explicitly flags as the floor of acceptability rather than a sensible default.

## Constant-time comparison

The output of `bcrypt.hash` is a self-describing string that embeds the cost,
the salt, and the digest. Authentication code must verify a candidate password
by re-running the algorithm against the stored hash, not by comparing the
candidate to a freshly hashed value with `===`.

Code **must not** compare bcrypt hashes with `===` or `==` — the only correct
verification path is `bcrypt.compare(plaintext, storedHash)`, which performs a
constant-time digest comparison. Code **must not** decode the stored hash to
extract its salt and call `bcrypt.hash` a second time, because string equality
on the resulting digest is not a constant-time operation and leaks timing
information about partial matches.

## Logging and error handling

Authentication endpoints frequently log request bodies for debugging. When
`bcrypt.compare` rejects a candidate, the surrounding error path must not
preserve the plaintext password in any log line, exception message, or stack
trace.

Code **must not** log raw password values at any verbosity level, including
`debug` and `trace`. Code **must not** include the plaintext password in error
messages thrown from authentication handlers, even when the surrounding
framework is configured to swallow them. Code **should** redact request bodies
before they reach a structured logger when those bodies contain a `password`,
`pass`, or `pwd` field.

## Asynchronous API

`bcryptjs` exposes both synchronous (`hashSync`, `compareSync`) and
asynchronous (`hash`, `compare`) variants. The synchronous variants block the
event loop for the full duration of the hash computation, which at cost `12`
is on the order of hundreds of milliseconds.

Code **should** prefer `bcrypt.hash` and `bcrypt.compare` over their `Sync`
counterparts in any request-handling path, because the synchronous variants
stall every concurrent request on the same Node.js process. Code **must not**
call `bcrypt.hashSync` inside an Express middleware or route handler that
serves user traffic.
