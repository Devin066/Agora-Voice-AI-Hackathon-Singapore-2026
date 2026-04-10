extends Control

const DEFAULT_SERVER_URL := "http://127.0.0.1:8787"

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
@onready var start_request: HTTPRequest = $StartRequest
@onready var stop_request: HTTPRequest = $StopRequest

var current_agent_id := ""
var current_channel := ""
var current_agent_uid := 0


func _ready() -> void:
	service_url_input.text = DEFAULT_SERVER_URL
	start_button.pressed.connect(_on_start_pressed)
	stop_button.pressed.connect(_on_stop_pressed)
	start_request.request_completed.connect(_on_start_request_completed)
	stop_request.request_completed.connect(_on_stop_request_completed)
	_append_log("Scene ready. Waiting for the local Agora session server.")
	_refresh_status("Idle")


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
		_append_log("[color=#ff7b7b]Stop request failed to send: %s[/color]" % error_string(error))
		_refresh_status("Stop request failed")
		return

	start_button.disabled = true
	stop_button.disabled = true
	_refresh_status("Stopping session...")
	_append_log("POST %s" % request_url)
	_append_log(body)


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
