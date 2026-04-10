## voice_diagnostics.gd
## Standalone diagnostic scene for voice pipeline issues.
## Run this scene directly. It prints results to screen and Output panel.
## Does NOT depend on GameSessionManager autoload.
extends Control

const SERVER_URL := "http://127.0.0.1:8080"
const PLAYER_UID := 5000
const NPC_ID := "maid"

# --- UI refs (built dynamically) ---
var _log_label: RichTextLabel
var _step_label: Label

# --- HTTP nodes ---
var _http_health: HTTPRequest
var _http_start: HTTPRequest
var _http_interact: HTTPRequest
var _http_end: HTTPRequest

# --- WebView ---
var _webview: Node = null
var _webview_loaded := false
var _webview_join_sent := false
var _webview_join_confirmed := false
var _webview_ipc_received := false

# --- Session state ---
var _session_id := ""
var _channel := ""
var _app_id := ""
var _rtc_token := ""
var _agent_id := ""

# --- Step tracking ---
enum Step {
	IDLE,
	CHECK_PLUGIN,
	CHECK_SERVER,
	START_SESSION,
	START_NPC,
	SETUP_WEBVIEW,
	SEND_JOIN,
	WAIT_JOIN_CONFIRM,
	CLEANUP,
	DONE,
}
var _step: Step = Step.IDLE
var _step_timer := 0.0
var _join_wait_elapsed := 0.0

const JOIN_TIMEOUT_SEC := 12.0

func _ready() -> void:
	_build_ui()
	_build_http_nodes()
	call_deferred("_run_diagnostics")


func _process(delta: float) -> void:
	if _step == Step.WAIT_JOIN_CONFIRM:
		_join_wait_elapsed += delta
		_step_label.text = "Waiting for RTC join confirmation… %.1fs / %.0fs" % [_join_wait_elapsed, JOIN_TIMEOUT_SEC]
		if _join_wait_elapsed >= JOIN_TIMEOUT_SEC:
			_fail("TIMEOUT: WebView never sent 'voice_status: joined' after %.0f seconds.\n\nPossible causes:\n• post_message did not reach the HTML (WRY IPC broken)\n• Agora RTC join failed (check token/channel/appId)\n• Microphone permission denied\n• AgoraRTC SDK failed to load in WebView (/static/agora-rtc.js 404?)" % JOIN_TIMEOUT_SEC)


# ── UI Construction ───────────────────────────────────────────────────────────

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.06, 0.07, 0.1, 1.0)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 40)
	margin.add_theme_constant_override("margin_top", 30)
	margin.add_theme_constant_override("margin_right", 40)
	margin.add_theme_constant_override("margin_bottom", 30)
	add_child(margin)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	margin.add_child(vbox)

	var title := Label.new()
	title.text = "Voice Pipeline Diagnostics"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(0.98, 0.88, 0.55, 1))
	vbox.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "Tests: WRY plugin → server → session → NPC agent → WebView IPC → RTC join"
	subtitle.add_theme_font_size_override("font_size", 14)
	subtitle.add_theme_color_override("font_color", Color(0.55, 0.65, 0.7, 1))
	vbox.add_child(subtitle)

	var sep := HSeparator.new()
	vbox.add_child(sep)

	_step_label = Label.new()
	_step_label.text = "Initialising…"
	_step_label.add_theme_font_size_override("font_size", 16)
	_step_label.add_theme_color_override("font_color", Color(0.7, 0.9, 1.0, 1))
	vbox.add_child(_step_label)

	_log_label = RichTextLabel.new()
	_log_label.bbcode_enabled = true
	_log_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log_label.scroll_following = true
	_log_label.add_theme_font_size_override("normal_font_size", 15)
	vbox.add_child(_log_label)

	# Quit button
	var btn := Button.new()
	btn.text = "Close Diagnostics"
	btn.pressed.connect(func(): get_tree().quit())
	vbox.add_child(btn)


func _build_http_nodes() -> void:
	_http_health = HTTPRequest.new()
	_http_start = HTTPRequest.new()
	_http_interact = HTTPRequest.new()
	_http_end = HTTPRequest.new()
	add_child(_http_health)
	add_child(_http_start)
	add_child(_http_interact)
	add_child(_http_end)
	_http_health.request_completed.connect(_on_health)
	_http_start.request_completed.connect(_on_start)
	_http_interact.request_completed.connect(_on_interact)
	_http_end.request_completed.connect(_on_end)


# ── Logging helpers ───────────────────────────────────────────────────────────

func _log(msg: String) -> void:
	print("[VoiceDiag] " + msg)
	_log_label.append_text(msg + "\n")


func _ok(msg: String) -> void:
	print("[VoiceDiag] ✓ " + msg)
	_log_label.append_text("[color=#89f0c7]✓ " + msg + "[/color]\n")


func _warn(msg: String) -> void:
	print("[VoiceDiag] ⚠ " + msg)
	_log_label.append_text("[color=#ffd580]⚠ " + msg + "[/color]\n")


func _fail(msg: String) -> void:
	print("[VoiceDiag] ✗ " + msg)
	_log_label.append_text("[color=#ff7b7b]✗ " + msg + "[/color]\n")
	_step_label.text = "❌ Diagnostics stopped — see log above"
	_step = Step.DONE
	# Try to clean up agent if one was started
	if _agent_id != "":
		_log("Attempting cleanup of agent %s…" % _agent_id)
		var body := JSON.stringify({"sessionId": _session_id})
		_http_end.request(
			"%s/api/npc/%s/end" % [SERVER_URL, NPC_ID],
			["Content-Type: application/json"],
			HTTPClient.METHOD_POST,
			body
		)


func _succeed() -> void:
	_step_label.text = "✅ All checks passed — voice pipeline is working!"
	_log_label.append_text("\n[color=#89f0c7][b]✅ Full voice pipeline confirmed working.[/b][/color]\n")
	_log_label.append_text("[color=#89f0c7]The WebView joined the Agora channel and confirmed audio is active.[/color]\n")
	_step = Step.DONE


# ── Diagnostic flow ───────────────────────────────────────────────────────────

func _run_diagnostics() -> void:
	_log("=== Voice Pipeline Diagnostics ===")
	_log("Server: %s   NPC: %s   PlayerUID: %d" % [SERVER_URL, NPC_ID, PLAYER_UID])
	_log("")

	# ── Step 1: WRY Plugin ────────────────────────────────────────────────────
	_step = Step.CHECK_PLUGIN
	_step_label.text = "Step 1/7: Checking Godot WRY plugin…"
	_log("[b]Step 1: Godot WRY WebView plugin[/b]")

	var wry_exists := ClassDB.class_exists("WebView")
	if not wry_exists:
		_fail(
			"WebView class NOT found.\n" +
			"Fix: Project → Project Settings → Plugins → enable 'Godot WRY'.\n" +
			"Then restart the Godot editor."
		)
		return
	_ok("WebView class exists (WRY plugin is loaded)")

	var test_wv = ClassDB.instantiate("WebView")
	if test_wv == null:
		_fail("WebView class exists but could not be instantiated.")
		return
	_ok("WebView can be instantiated")

	# Check has_signal ipc_message
	if not test_wv.has_signal("ipc_message"):
		_warn("WebView node does NOT have signal 'ipc_message' — IPC from HTML to Godot will be silent.\nThis means join/leave confirmations won't reach Godot.")
	else:
		_ok("WebView has 'ipc_message' signal")

	# Check has post_message method
	if not test_wv.has_method("post_message"):
		_fail("WebView node does NOT have method 'post_message' — Godot cannot send join/leave to the HTML page.")
		test_wv.queue_free()
		return
	_ok("WebView has 'post_message' method")

	# Check load_url
	if not test_wv.has_method("load_url"):
		_fail("WebView node does NOT have method 'load_url'.")
		test_wv.queue_free()
		return
	_ok("WebView has 'load_url' method")

	test_wv.queue_free()
	_log("")

	# ── Step 2: Server health ─────────────────────────────────────────────────
	_step = Step.CHECK_SERVER
	_step_label.text = "Step 2/7: Checking backend server…"
	_log("[b]Step 2: Backend server health[/b]")
	_http_health.request(SERVER_URL + "/health")


func _on_health(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if code != 200:
		_fail("GET /health returned HTTP %d.\nFix: run 'npm run agora:server' in the terminal." % code)
		return
	_ok("Server is healthy (HTTP 200)")
	_log("")

	# ── Step 3: Start game session ────────────────────────────────────────────
	_step = Step.START_SESSION
	_step_label.text = "Step 3/7: Creating game session…"
	_log("[b]Step 3: Game session[/b]")
	_session_id = "diag_%d" % int(Time.get_unix_time_from_system())
	var payload := JSON.stringify({"sessionId": _session_id})
	_http_start.request(SERVER_URL + "/api/game/start", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)


func _on_start(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		_fail("POST /api/game/start failed (HTTP %d): %s" % [code, text])
		return
	_ok("Session created: %s" % _session_id)
	_log("")

	# ── Step 4: Spawn NPC agent ───────────────────────────────────────────────
	_step = Step.START_NPC
	_step_label.text = "Step 4/7: Spawning NPC voice agent…"
	_log("[b]Step 4: NPC voice agent (this may take 2-3 seconds)[/b]")
	var payload := JSON.stringify({"sessionId": _session_id, "playerUid": PLAYER_UID})
	_http_interact.request(
		"%s/api/npc/%s/interact" % [SERVER_URL, NPC_ID],
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		payload
	)


func _on_interact(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		_fail("POST /api/npc/%s/interact failed (HTTP %d): %s" % [NPC_ID, code, text])
		return

	_channel = str(data.get("channelName", ""))
	_app_id = str(data.get("appId", ""))
	_rtc_token = str(data.get("rtcToken", ""))
	_agent_id = str(data.get("agentId", ""))

	if _channel == "" or _app_id == "" or _rtc_token == "" or _agent_id == "":
		_fail("NPC interact response missing fields.\nGot: %s" % text)
		return

	_ok("Agent spawned: %s" % _agent_id)
	_ok("Channel: %s" % _channel)
	_ok("AppId: %s…" % _app_id.left(8))
	_ok("RTC token present: %d chars" % _rtc_token.length())
	_log("")

	# ── Step 5: Create and load WebView ──────────────────────────────────────
	_step = Step.SETUP_WEBVIEW
	_step_label.text = "Step 5/7: Setting up WebView and loading voice page…"
	_log("[b]Step 5: WebView setup[/b]")
	_setup_webview()


func _setup_webview() -> void:
	_webview = ClassDB.instantiate("WebView")
	if _webview == null:
		_fail("WebView instantiation returned null at runtime.")
		return

	# Use a VISIBLE container — same approach as agora_test_scene which works
	var host := Control.new()
	host.name = "DiagWebViewHost"
	host.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	host.size = Vector2(320, 120)
	host.position = Vector2(get_viewport_rect().size.x - 340, get_viewport_rect().size.y - 140)
	add_child(host)

	host.add_child(_webview)
	_webview.set_anchors_preset(Control.PRESET_FULL_RECT)
	_webview.set("autoplay", true)

	if _webview.has_signal("ipc_message"):
		_webview.connect("ipc_message", Callable(self, "_on_webview_ipc"))
		_ok("Connected to ipc_message signal")
	else:
		_warn("ipc_message signal NOT available — join confirmation will time out\n(Godot can still send post_message but cannot receive responses)")

	_ok("WebView node created and added to scene tree")
	_log("Loading voice page: %s/agora-voice" % SERVER_URL)
	_webview.call("load_url", SERVER_URL + "/agora-voice")

	# Wait a moment for page to load before sending join
	_step_label.text = "Step 5/7: Loading voice page (waiting 2s)…"
	await get_tree().create_timer(2.0).timeout

	_log("")
	# ── Step 6: Send join ─────────────────────────────────────────────────────
	_step = Step.SEND_JOIN
	_step_label.text = "Step 6/7: Sending join message to WebView…"
	_log("[b]Step 6: Sending join via post_message[/b]")

	var msg := JSON.stringify({
		"action": "join",
		"appId": _app_id,
		"channel": _channel,
		"token": _rtc_token,
		"uid": PLAYER_UID,
	})

	_log("Sending: action=join  channel=%s  uid=%d" % [_channel, PLAYER_UID])
	_webview.call("post_message", msg)
	_ok("post_message called")
	_log("")

	# ── Step 7: Wait for join confirmation ────────────────────────────────────
	_step = Step.WAIT_JOIN_CONFIRM
	_join_wait_elapsed = 0.0
	_log("[b]Step 7: Waiting for RTC join confirmation from WebView[/b]")
	_log("(Listening for voice_status: joined via ipc_message…)")
	_log("If this times out, the HTML received the join but Agora RTC failed, OR")
	_log("post_message never reached the HTML page.")


func _on_webview_ipc(message: String) -> void:
	_webview_ipc_received = true
	_log("[IPC received] raw: %s" % message)

	var data = JSON.parse_string(message)
	if typeof(data) != TYPE_DICTIONARY:
		_warn("IPC message is not valid JSON: %s" % message)
		return

	var msg_type := str(data.get("type", ""))
	var status := str(data.get("status", ""))
	_ok("IPC message: type=%s  status=%s" % [msg_type, status])

	if msg_type == "voice_page" and status == "ready":
		_ok("Voice page is loaded and ready in WebView")

	if msg_type == "voice_status":
		match status:
			"joined":
				_webview_join_confirmed = true
				_ok("RTC JOIN CONFIRMED — Agora channel joined successfully!")
				_ok("You should now hear the NPC agent speaking.")
				_log("")
				_log("Cleaning up agent in 3 seconds…")
				await get_tree().create_timer(3.0).timeout
				_cleanup()
			"error":
				var detail := str(data.get("detail", "no detail"))
				_fail("RTC join error from WebView: %s\n\nThis means post_message reached the HTML, but Agora RTC join failed.\nCommon causes:\n• Token expired or mismatched channel\n• AppId wrong\n• Network issue reaching Agora servers\n• Microphone permission denied" % detail)
			"left":
				_log("WebView left channel (cleanup complete)")


func _cleanup() -> void:
	_step = Step.CLEANUP
	_log("")
	_log("[b]Cleanup: stopping NPC agent[/b]")
	var payload := JSON.stringify({"sessionId": _session_id})
	_http_end.request(
		"%s/api/npc/%s/end" % [SERVER_URL, NPC_ID],
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		payload
	)


func _on_end(_result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if _step == Step.DONE:
		return  # cleanup after failure, ignore
	if code == 200:
		_ok("Agent stopped cleanly")
	else:
		_warn("Agent stop returned HTTP %d (may have already timed out)" % code)
	_agent_id = ""
	_succeed()
