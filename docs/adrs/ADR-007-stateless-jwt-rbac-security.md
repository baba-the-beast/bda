# ADR-007: Stateless JWT Authentication with Argon2id and Hierarchical RBAC

## Status
Accepted

## Context
Microservices need to verify incoming client credentials and permissions without introducing a central bottleneck database call on every internal HTTP hop. User passwords must be protected against GPU brute-force attacks.

## Decision
1. **Password Hashing**: Use **Argon2id** ($m=65536, t=3, p=4$) via `passlib` with PBKDF2 fallback.
2. **Stateless JWT**:
   - Short-lived Access Tokens (15 minutes) signed with HMAC-SHA256 containing `sub`, `email`, and `role`.
   - Long-lived Refresh Tokens (7 days) with token type verification (`type="refresh"`).
   - Downstream services verify tokens locally using shared secret or public key without contacting `auth-service`.
3. **Role Hierarchy**:
   - `ADMIN` > `ANALYST` > `VIEWER`.
   - Enforced via `@require_role` decorators and gateway-level inspection.

## Consequences
- **Positive**: Highly scalable, zero database roundtrips for authenticated microservice endpoints; high resistance to credential cracking.
- **Negative**: Token revocation before expiration requires Redis token denylist.
