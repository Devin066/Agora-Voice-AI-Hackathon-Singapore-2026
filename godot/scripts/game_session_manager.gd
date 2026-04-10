extends Node

signal session_initialized(npcs: Array)
signal npc_session_started(npc_id: String, app_id: String, channel: String, rtc_token: String, player_uid: int)
signal npc_session_ended(npc_id: String, breakdown: int, trust: int, tier: String, journal_entry: Dictionary)
signal accusation_result(correct: bool, reveal: Dictionary)
signal server_error(endpoint: String, message: String)

const SERVER_URL := "http://127.0.0.1:8080"
const PLAYER_UID := 5000

var session_id := ""
var active_npc_id := ""
var _ending_npc_id := ""  # Tracks which NPC is being ended while awaiting HTTP response

@onready var _health_req: HTTPRequest = $HealthRequest
@onready var _start_req: HTTPRequest = $StartRequest
@onready var _interact_req: HTTPRequest = $InteractRequest
@onready var _end_req: HTTPRequest = $EndRequest
@onready var _accuse_req: HTTPRequest = $AccuseRequest
@onready var _evidence_req: HTTPRequest = $EvidenceRequest


func _ready() -> void:
	_health_req.request_completed.connect(_on_health_completed)
	_start_req.request_completed.connect(_on_start_completed)
	_interact_req.request_completed.connect(_on_interact_completed)
	_end_req.request_completed.connect(_on_end_completed)
	_accuse_req.request_completed.connect(_on_accuse_completed)
	_evidence_req.request_completed.connect(_on_evidence_completed)


func initialize() -> void:
	session_id = "session_%d" % int(Time.get_unix_time_from_system())
	_health_req.request(SERVER_URL + "/health")


func start_npc_conversation(npc_id: String, round_number: int = 1, phase: String = "investigation") -> void:
	if active_npc_id != "":
		push_warning("[GSM] Already in conversation with %s — ignoring request for %s" % [active_npc_id, npc_id])
		return
	if session_id == "":
		push_warning("[GSM] No session initialized — call initialize() first")
		return

	var payload := JSON.stringify({
		"sessionId": session_id,
		"playerUid": PLAYER_UID,
		"round": round_number,
		"phase": phase,
	})
	var url := "%s/api/npc/%s/interact" % [SERVER_URL, npc_id]
	var err := _interact_req.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if err != OK:
		emit_signal("server_error", url, "HTTP request failed: %s" % error_string(err))
		return
	# Optimistically set so we don't double-trigger while waiting for response
	active_npc_id = npc_id


func end_npc_conversation() -> void:
	if active_npc_id == "":
		return
	if session_id == "":
		return

	_ending_npc_id = active_npc_id
	active_npc_id = ""  # Clear immediately to prevent double-end

	var payload := JSON.stringify({ "sessionId": session_id })
	var url := "%s/api/npc/%s/end" % [SERVER_URL, _ending_npc_id]
	var err := _end_req.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if err != OK:
		emit_signal("server_error", url, "HTTP request failed: %s" % error_string(err))


func submit_accusation(suspect_npc_id: String, weapon: String, room: String) -> void:
	if session_id == "":
		return
	var payload := JSON.stringify({
		"sessionId": session_id,
		"suspectNpcId": suspect_npc_id,
		"weapon": weapon,
		"room": room,
	})
	var url := SERVER_URL + "/api/game/accuse"
	var err := _accuse_req.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if err != OK:
		emit_signal("server_error", url, "HTTP request failed: %s" % error_string(err))


func log_evidence(content: String) -> void:
	if session_id == "":
		return
	var payload := JSON.stringify({ "sessionId": session_id, "content": content })
	_evidence_req.request(SERVER_URL + "/api/game/evidence", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)


# ── Response handlers ─────────────────────────────────────────────────────────

func _on_health_completed(_result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if code != 200:
		emit_signal("server_error", "/health", "Backend not reachable (HTTP %d). Run: npm run agora:server" % code)
		return
	# Health OK — now start the game session
	var payload := JSON.stringify({ "sessionId": session_id })
	var err := _start_req.request(SERVER_URL + "/api/game/start", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if err != OK:
		emit_signal("server_error", "/api/game/start", "HTTP request failed: %s" % error_string(err))


func _on_start_completed(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		emit_signal("server_error", "/api/game/start", "Failed (%d): %s" % [code, text])
		return
	var npcs: Array = data.get("npcs", [])
	emit_signal("session_initialized", npcs)


func _on_interact_completed(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		active_npc_id = ""  # Roll back optimistic set
		emit_signal("server_error", "/api/npc/interact", "Failed (%d): %s" % [code, text])
		return

	emit_signal(
		"npc_session_started",
		active_npc_id,
		str(data.get("appId", "")),
		str(data.get("channelName", "")),
		str(data.get("rtcToken", "")),
		PLAYER_UID
	)


func _on_end_completed(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		emit_signal("server_error", "/api/npc/end", "Failed (%d): %s" % [code, text])
		return

	var journal_entry: Dictionary = data.get("journalEntry", {})
	emit_signal(
		"npc_session_ended",
		_ending_npc_id,
		int(data.get("breakdown", 0)),
		int(data.get("trust", 50)),
		str(data.get("tier", "calm")),
		journal_entry
	)
	_ending_npc_id = ""


func _on_accuse_completed(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var data = JSON.parse_string(text)
	if code != 200 or typeof(data) != TYPE_DICTIONARY:
		emit_signal("server_error", "/api/game/accuse", "Failed (%d): %s" % [code, text])
		return
	var correct: bool = bool(data.get("correct", false))
	var reveal: Dictionary = data.get("reveal", {})
	emit_signal("accusation_result", correct, reveal)


func _on_evidence_completed(_result: int, _code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	pass  # Fire and forget
