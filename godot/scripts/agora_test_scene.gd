extends Control

const DEFAULT_SERVER_URL := "http://127.0.0.1:8080"

@onready var service_url_input: LineEdit = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/ServiceUrlInput
@onready var channel_input: LineEdit = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/ChannelInput
@onready var player_uid_input: LineEdit = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/PlayerUidInput
@onready var agent_uid_input: LineEdit = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/AgentUidInput
@onready var pipeline_input: LineEdit = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/PipelineInput
@onready var start_button: Button = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/Buttons/StartButton
@onready var stop_button: Button = $Margin/Layout/Columns/ControlsPanel/ControlsMargin/ControlsBox/Buttons/StopButton
@onready var status_text: Label = $Margin/Layout/Columns/StatusPanel/StatusMargin/StatusBox/StatusText
@onready var agent_id_text: Label = $Margin/Layout/Columns/StatusPanel/StatusMargin/StatusBox/AgentIdText
@onready var channel_text: Label = $Margin/Layout/Columns/StatusPanel/StatusMargin/StatusBox/ChannelText
@onready var log_output: RichTextLabel = $Margin/Layout/Columns/StatusPanel/StatusMargin/StatusBox/LogPanel/LogOutput
@onready var voice_host: Control = $Margin/Layout/VoiceStrip/VoiceHost
@onready var voice_hint: Label = $Margin/Layout/VoiceStrip/VoiceHint
@onready var start_request: HTTPRequest = $StartRequest
@onready var stop_request: HTTPRequest = $StopRequest

var current_agent_id := ""
var current_channel := ""
var current_agent_uid := 0

var _voice_webview: Node = null
var _awaiting_voice_leave_before_stop := false


func _ready() -> void:
	service_url_input.text = DEFAULT_SERVER_URL
	start_button.pressed.connect(_on_start_pressed)
	stop_button.pressed.connect(_on_stop_pressed)
	start_request.request_completed.connect(_on_start_request_completed)
	stop_request.request_completed.connect(_on_stop_request_completed)
	_setup_voice_webview()
	_append_log("Scene ready. Run `npm run agora:server`, enable Godot WRY for voice, then Start Session.")
	_refresh_status("Idle")


func _setup_voice_webview() -> void:
	if not ClassDB.class_exists("WebView"):
		voice_hint.text = "Voice: install AssetLib « Godot WRY », enable Project → Plugins, restart the editor, then run this scene."
		return
	_voice_webview = ClassDB.instantiate("WebView")
	if _voice_webview == null:
		voice_hint.text = "Voice: could not create WebView node."
		return
	voice_host.add_child(_voice_webview)
	_voice_webview.set_anchors_preset(Control.PRESET_FULL_RECT)
	_voice_webview.set("autoplay", true)
	if _voice_webview.has_signal("ipc_message"):
		_voice_webview.connect("ipc_message", Callable(self, "_on_voice_ipc"))
	voice_hint.text = "Voice: WebView ready — after Start Session, allow the microphone when the browser asks."
	call_deferred("_load_voice_page")


func _load_voice_page() -> void:
	if _voice_webview == null or not _voice_webview.has_method("load_url"):
		return
	var base := _server_url()
	_voice_webview.call("load_url", "%s/agora-voice" % base)


func _on_voice_ipc(message: String) -> void:
	var data = JSON.parse_string(message)
	if typeof(data) != TYPE_DICTIONARY:
		return
	var msg_type := str(data.get("type", ""))
	if msg_type == "voice_page" and str(data.get("status", "")) == "ready":
		_append_log("[color=#a8d5ff]Voice page loaded in WebView.[/color]")
		return
	if msg_type != "voice_status":
		return
	var st := str(data.get("status", ""))
	_append_log("[color=#a8d5ff]Voice: %s[/color]" % st)
	if st == "error":
		var detail := str(data.get("detail", ""))
		if detail != "":
			_append_log("[color=#ff7b7b]%s[/color]" % detail)
	if _awaiting_voice_leave_before_stop and st == "left":
		_awaiting_voice_leave_before_stop = false
		_send_stop_http()


func _on_start_pressed() -> void:
	var payload := {
		"channel": channel_input.text.strip_edges(),
		"playerUid": _read_int(player_uid_input.text, 1000),
		"agentUid": _read_int(agent_uid_input.text, 2001),
	}

	var pipeline_id := pipeline_input.text.strip_edges()
	if pipeline_id != "":
		payload["pipelineId"] = pipeline_id

	var request_url := "%s/api/agora/session/start" % _server_url()
	var body := JSON.stringify(payload)
	var error := start_request.request(
		request_url,
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

	if error != OK:
		_append_log("[color=#ff7b7b]Start request failed to send: %s[/color]" % error_string(error))
		_refresh_status("Start request failed")
		return

	start_button.disabled = true
	stop_button.disabled = true
	_refresh_status("Starting session...")
	_append_log("POST %s" % request_url)
	_append_log(body)


func _on_stop_pressed() -> void:
	if current_agent_id == "":
		_append_log("[color=#ffcf75]No active agent to stop.[/color]")
		return

	start_button.disabled = true
	stop_button.disabled = true
	_refresh_status("Stopping session...")

	if _voice_webview != null:
		_awaiting_voice_leave_before_stop = true
		_voice_webview.call("post_message", JSON.stringify({ "action": "leave" }))
		_run_stop_fallback_timer()
	else:
		_send_stop_http()


func _run_stop_fallback_timer() -> void:
	var t := get_tree().create_timer(3.0)
	t.timeout.connect(_on_stop_voice_fallback_timeout)


func _on_stop_voice_fallback_timeout() -> void:
	if not _awaiting_voice_leave_before_stop:
		return
	if current_agent_id == "":
		_awaiting_voice_leave_before_stop = false
		start_button.disabled = false
		return
	_append_log("[color=#ffcf75]Voice leave timed out; stopping agent anyway.[/color]")
	_awaiting_voice_leave_before_stop = false
	_send_stop_http()


func _send_stop_http() -> void:
	var payload := {
		"agentId": current_agent_id,
		"channel": current_channel,
		"agentUid": current_agent_uid,
	}
	var request_url := "%s/api/agora/session/stop" % _server_url()
	var body := JSON.stringify(payload)
	var error := stop_request.request(
		request_url,
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

	if error != OK:
		start_button.disabled = false
		stop_button.disabled = current_agent_id == ""
		_refresh_status("Stop request failed")
		_append_log("[color=#ff7b7b]Stop request failed to send: %s[/color]" % error_string(error))
		return

	_append_log("POST %s" % request_url)
	_append_log(body)


func _post_voice_join(session: Dictionary) -> void:
	if _voice_webview == null:
		_append_log(
			"[color=#ffcf75]Session started — install/enable Godot WRY to speak and hear the agent in this scene.[/color]"
		)
		return
	var msg := {
		"action": "join",
		"appId": str(session.get("appId", "")),
		"channel": str(session.get("channel", "")),
		"token": str(session.get("rtc_token", "")),
		"uid": int(session.get("player_uid", 1000)),
	}
	_voice_webview.call("post_message", JSON.stringify(msg))


func _on_start_request_completed(
	_result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	start_button.disabled = false
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)

	if response_code != 200 or typeof(data) != TYPE_DICTIONARY:
		_refresh_status("Start failed")
		_append_log("[color=#ff7b7b]Start failed (%d): %s[/color]" % [response_code, text])
		return

	current_agent_id = str(data.get("agent", {}).get("agent_id", ""))
	current_channel = str(data.get("channel", ""))
	current_agent_uid = int(data.get("agent_uid", 0))
	stop_button.disabled = current_agent_id == ""
	_refresh_status("Session running")
	agent_id_text.text = "Agent ID: %s" % current_agent_id
	channel_text.text = "Channel: %s" % current_channel
	_append_log("[color=#89f0c7]Session started successfully.[/color]")
	_append_log(JSON.stringify(data, "  "))
	_post_voice_join(data)


func _on_stop_request_completed(
	_result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	start_button.disabled = false
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)

	if response_code != 200:
		stop_button.disabled = false
		_refresh_status("Stop failed")
		_append_log("[color=#ff7b7b]Stop failed (%d): %s[/color]" % [response_code, text])
		return

	current_agent_id = ""
	current_channel = ""
	current_agent_uid = 0
	stop_button.disabled = true
	_refresh_status("Idle")
	agent_id_text.text = "Agent ID: none"
	channel_text.text = "Channel: none"
	_append_log("[color=#89f0c7]Session stopped successfully.[/color]")
	if typeof(data) == TYPE_DICTIONARY:
		_append_log(JSON.stringify(data, "  "))
	else:
		_append_log(text)


func _server_url() -> String:
	var value := service_url_input.text.strip_edges()
	if value == "":
		return DEFAULT_SERVER_URL
	return value.trim_suffix("/")


func _read_int(text: String, fallback: int) -> int:
	if text.strip_edges() == "":
		return fallback
	return int(text)


func _refresh_status(message: String) -> void:
	status_text.text = "Status: %s" % message
	if current_agent_id == "":
		agent_id_text.text = "Agent ID: none"
	if current_channel == "":
		channel_text.text = "Channel: none"


func _append_log(message: String) -> void:
	log_output.append_text("%s\n\n" % message)
