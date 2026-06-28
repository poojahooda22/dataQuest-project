"""Correlation-id middleware (pure ASGI) — the seam the RFC-9457 envelope reads.

Mounted as the OUTERMOST wrapper around the whole app, so EVERY response — success, 4xx,
and even the worst-case 500 emitted by Starlette's outermost ServerErrorMiddleware — carries
an `X-Correlation-ID` header. An inner (BaseHTTP) middleware CANNOT guarantee this:
ServerErrorMiddleware is outermost and sends the 500 past any inner middleware, so the header
would survive only by goodwill. Sitting outside it removes that fragility.

It also stashes the id on `scope["state"]` so the error handlers (which read
`request.state.correlation_id`) echo the SAME id in the problem body. Full structured JSON
logging is a later Phase-6 step.

Frontend analogy: like one Express middleware at the very top of the stack that tags every
request and stamps the id on every response on the way out.
"""

from __future__ import annotations

import re
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

CORRELATION_HEADER = "X-Correlation-ID"
_HEADER_KEY = b"x-correlation-id"
# Accept a client-sent id only if safe: bounded length, no CRLF/control chars (header- and
# log-injection defense). `\Z` (not `$`) so a trailing newline is rejected by the regex itself,
# not merely by the .strip() below. Anything else is replaced with a freshly minted id.
_VALID = re.compile(r"^[A-Za-z0-9._-]{1,128}\Z")


def _resolve_cid(scope: Scope) -> str:
    sent: dict[bytes, bytes] = {}
    for key, value in scope.get("headers", []):
        if key in (b"x-correlation-id", b"x-request-id"):
            sent[key] = value
    raw = sent.get(b"x-correlation-id") or sent.get(b"x-request-id")
    cid = raw.decode("latin-1").strip() if raw else ""
    return cid if _VALID.match(cid) else uuid.uuid4().hex


class CorrelationIdMiddleware:
    """Pure-ASGI; mount as the OUTERMOST wrapper so it sees every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        cid = _resolve_cid(scope)
        # scope["state"] backs request.state, so the error handlers read the same id.
        scope.setdefault("state", {})["correlation_id"] = cid

        async def send_with_cid(message: Message) -> None:
            if message["type"] == "http.response.start":
                # Drop any pre-existing value, then set ours — no duplicate header.
                headers = [(k, v) for (k, v) in message.get("headers", []) if k.lower() != _HEADER_KEY]
                headers.append((_HEADER_KEY, cid.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_cid)