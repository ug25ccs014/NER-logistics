"""
Real authentication for the NER Logistics Platform.

- Passwords are hashed with bcrypt (the `bcrypt` package directly --
  not passlib, whose bundled bcrypt self-test breaks against bcrypt
  >=4.1's stricter API). Never stored or compared in plaintext.
- Sessions are stateless JWTs: the server signs {account_id, role,
  name, expiry} and the client sends it back as
  `Authorization: Bearer <token>` on later requests. Nothing is kept
  server-side, so there's no session table to manage -- to "log out"
  everywhere, rotate JWT_SECRET.
- Field officials and authority accounts additionally require a
  shared org "passkey" to register as that role, so a random visitor
  can't just pick "Authority" in a dropdown and get elevated access.
  This is a coarse gate (one shared secret per role), not per-user
  authorization -- good enough for a hackathon/pilot, not a
  substitute for real per-user role approval in production.
"""
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
import config

VALID_ROLES = {"driver", "field_official", "authority"}
PRIVILEGED_ROLES = {"field_official", "authority"}

ROLE_PASSKEYS = {
    "field_official": config.FIELD_OFFICER_PASSKEY,
    "authority": config.AUTHORITY_PASSKEY,
}

# bcrypt silently ignores/rejects bytes past 72 -- truncate ourselves
# so hash and verify always agree, instead of relying on whatever a
# given bcrypt version does with an overlong input.
_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))


def check_passkey(role: str, passkey) -> bool:
    """True if this role needs no passkey, or the supplied one matches."""
    required = ROLE_PASSKEYS.get(role)
    if not required:
        return True
    return passkey is not None and passkey == required


def create_access_token(account_id: int, role: str, full_name: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(account_id),
        "role": role,
        "name": full_name,
        "iat": now,
        "exp": now + timedelta(hours=config.JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Returns the payload dict, or raises jwt.PyJWTError (expired /
    invalid signature / malformed) -- callers turn that into a 401."""
    return jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
