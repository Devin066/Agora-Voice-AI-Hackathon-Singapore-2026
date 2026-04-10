import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tokens import build_convoai_token, build_rtc_token, build_rtm_token

# Use dummy credentials for testing — token generation is deterministic given inputs.
# AccessToken2 strictly requires 32 hex chars; otherwise build() returns "".
APP_ID = "0123456789abcdef0123456789abcdef"
APP_CERT = "fedcba9876543210fedcba9876543210"


class TestBuildRtcToken:
    def test_returns_nonempty_string(self):
        token = build_rtc_token(APP_ID, APP_CERT, "test_channel", 101)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_starts_with_007(self):
        token = build_rtc_token(APP_ID, APP_CERT, "test_channel", 101)
        assert token.startswith("007")

    def test_different_channels_produce_different_tokens(self):
        t1 = build_rtc_token(APP_ID, APP_CERT, "channel_a", 101)
        t2 = build_rtc_token(APP_ID, APP_CERT, "channel_b", 101)
        assert t1 != t2

    def test_different_uids_produce_different_tokens(self):
        t1 = build_rtc_token(APP_ID, APP_CERT, "channel", 100)
        t2 = build_rtc_token(APP_ID, APP_CERT, "channel", 101)
        assert t1 != t2


class TestBuildRtmToken:
    def test_returns_nonempty_string(self):
        token = build_rtm_token(APP_ID, APP_CERT, "101")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_starts_with_007(self):
        token = build_rtm_token(APP_ID, APP_CERT, "101")
        assert token.startswith("007")

    def test_different_users_produce_different_tokens(self):
        t1 = build_rtm_token(APP_ID, APP_CERT, "100")
        t2 = build_rtm_token(APP_ID, APP_CERT, "101")
        assert t1 != t2


class TestBuildConvoaiToken:
    def test_returns_nonempty_string(self):
        token = build_convoai_token(APP_ID, APP_CERT, "test_channel")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_starts_with_007(self):
        token = build_convoai_token(APP_ID, APP_CERT, "test_channel")
        assert token.startswith("007")

    def test_different_from_plain_rtc_token(self):
        """ConvoAI token has extra RTM privilege → must differ from plain RTC token."""
        convoai = build_convoai_token(APP_ID, APP_CERT, "channel", "0")
        rtc = build_rtc_token(APP_ID, APP_CERT, "channel", 0)
        assert convoai != rtc

    def test_accepts_string_uid(self):
        token = build_convoai_token(APP_ID, APP_CERT, "channel", "100")
        assert isinstance(token, str)
        assert len(token) > 0
