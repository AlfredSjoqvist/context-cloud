# Login route security

Login route handlers **must** rate-limit failed authentication attempts per source IP before issuing a session.

Login route handlers **must not** disclose whether an email address exists in the system through any error response.

Login route handlers **must** issue session cookies with the HttpOnly, Secure, and SameSite=strict flags set.

Login route handlers **should** invalidate any previous session for the user when a new login succeeds.
