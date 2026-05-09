# Session route security

Session route handlers **must** rotate the session identifier whenever the user's privilege level changes.

Session route handlers **must not** accept session tokens passed via URL query parameters or referrer headers.

Session route handlers **must** validate the session origin matches the configured allowed-origins list.

Session route handlers **should** expire idle sessions after 30 minutes of inactivity.
