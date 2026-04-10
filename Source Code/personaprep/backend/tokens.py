"""Agora token generation using AccessToken2 (007 format).

The older `agora-token-builder` package on PyPI only produces AccessToken v006
tokens, which modern Agora ConvoAI REST does not accept (returns 401 "Invalid
channel-name or uid"). We use the official AccessToken2 source vendored into
`agora_tokens/` (downloaded from AgoraIO/Tools).
"""

from agora_tokens.RtcTokenBuilder2 import RtcTokenBuilder, Role_Publisher

EXPIRE_SECONDS = 86400  # 24 hours


def build_rtc_token(
    app_id: str, app_cert: str, channel: str, uid: int, expire: int = EXPIRE_SECONDS
) -> str:
    """RTC token for browser clients joining the channel."""
    return RtcTokenBuilder.build_token_with_uid(
        app_id, app_cert, channel, uid, Role_Publisher, expire, expire
    )


def build_rtm_token(
    app_id: str, app_cert: str, user_id: str, expire: int = EXPIRE_SECONDS
) -> str:
    """RTM token for browser clients logging in to RTM signaling.

    We build this as a combined RTC+RTM token (channel-scoped to empty) via
    the same builder — the RTM privilege is what matters here.
    """
    return RtcTokenBuilder.build_token_with_rtm(
        app_id, app_cert, "", user_id, Role_Publisher, expire, expire
    )


def build_convoai_token(
    app_id: str,
    app_cert: str,
    channel: str,
    uid: str = "0",
    expire: int = EXPIRE_SECONDS,
) -> str:
    """Combined RTC+RTM token for the Agora ConvoAI Authorization header.

    Uses AccessToken2's `build_token_with_rtm` which is the pattern Agora's
    ConvoAI REST API validates against when using token auth.
    """
    return RtcTokenBuilder.build_token_with_rtm(
        app_id, app_cert, channel, uid, Role_Publisher, expire, expire
    )


def build_agent_rtc_token(
    app_id: str,
    app_cert: str,
    channel: str,
    account: str,
    expire: int = EXPIRE_SECONDS,
) -> str:
    """Plain RTC token for the agent to join the RTC channel.

    This goes in `properties.token` of the /join payload — it's the token
    the agent uses when joining the RTC channel, not the Authorization
    header. Must be built with the same string account as `agent_rtc_uid`
    (requires `enable_string_uid: true` in the join payload).
    """
    return RtcTokenBuilder.build_token_with_user_account(
        app_id, app_cert, channel, account, Role_Publisher, expire, expire
    )
