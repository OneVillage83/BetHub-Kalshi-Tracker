# Security Requirements

## Read-only v1

The tracker must not expose trading functionality.

Forbidden in v1:

- POST /portfolio/orders
- DELETE /portfolio/orders
- amend/decrease order endpoints
- order-group endpoints
- any automated trading action

## Key handling

- Private key must never enter browser JavaScript.
- Private key must never be committed to git.
- `.key`, `secrets/`, `.env`, and `.env.local` are ignored.
- Backend code loads private keys from encrypted storage or a server-side path.
- Show only a masked key ID hint in UI.

## Data safety

- Store raw JSON for audit.
- Do not mutate Kalshi account state.
- Add a global `READ_ONLY_MODE=true` check.
- Add code-level guard that throws if trading endpoint helpers are called.

## Future hardening

- Encrypted credential storage
- Local-only mode
- User login
- Audit logs
- Backup encryption
- IP allowlist for self-hosting
- Export redaction option
