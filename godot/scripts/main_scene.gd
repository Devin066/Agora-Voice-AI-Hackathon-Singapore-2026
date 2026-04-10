extends Node2D

@export var interact_distance := 104.0
@export var hold_duration := 0.8
@export var talk_distance := 120.0

@onready var player: CharacterBody2D = $World/Actors/Player
@onready var player_sprite: AnimatedSprite2D = $World/Actors/Player/AnimatedSprite2D
@onready var overlay: Control = $UI/Overlay
@onready var item: Node2D = $World/Actors/InteractableItem
@onready var item_lid: Node2D = $World/Actors/InteractableItem/Lid
@onready var item_glow: CanvasItem = $World/Actors/InteractableItem/ClueGlow
@onready var item_badge: Node2D = $World/Actors/InteractableItem/Badge
@onready var prompt = $UI/Overlay/InteractPrompt

const PROMPT_FONT := preload("res://assets/fonts/LilitaOne-Regular.ttf")
const VOICE_PROMPT_SCRIPT := preload("res://scripts/voice_prompt.gd")

var _hold_time := 0.0
var _item_open := false
var _interaction_tween: Tween
var _voice_prompt: Control
var minimap: Control

# Round tracking (updated externally or via round timer signal)
var _current_round := 1
var _current_phase := "investigation"

# Voice / NPC conversation state
var _voice_webview: Node = null
var _webview_page_ready := false
var _pending_join_msg := ""
var _awaiting_voice_leave := false
var _leave_fallback_timer: SceneTreeTimer = null
var _npcs: Array[Node2D] = []
var _nearest_npc: Node2D = null
var _talking_to_npc: Node2D = null
var _npc_talk_prompt: Label = null
var _server_error_label: Label = null
var _m_was_pressed := false
var _conversation_busy := false


func _ready() -> void:
	prompt.set_prompt_visible(false)
	prompt.set_progress(0.0)
	player_sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)
	_setup_voice_prompt()
	_setup_npc_talk_prompt()
	_setup_server_error_label()
	_setup_npcs()
	var glow_modulate := item_glow.modulate
	glow_modulate.a = 0.0
	item_glow.modulate = glow_modulate
	minimap = find_child("Minimap", true, false) as Control

	if minimap and minimap.has_method("configure"):
		minimap.call(
			"configure",
			player,
			$World/WalkPlane,
			[item],
			PackedStringArray(["Clue"])
		)

	_setup_voice_webview()
	_connect_session_manager()
	GameSessionManager.initialize()


func _process(delta: float) -> void:
	_update_item_interaction(delta)
	_update_npc_proximity()

	if _voice_prompt != null and _voice_prompt.has_method("set_active"):
		_voice_prompt.call("set_active", _talking_to_npc != null)


# ── Item interaction ──────────────────────────────────────────────────────────

func _update_item_interaction(delta: float) -> void:
	var near_item := player.global_position.distance_to(item.global_position) <= interact_distance
	var can_interact := near_item and not _is_animating()
	var is_holding := can_interact and Input.is_key_pressed(KEY_E)

	if is_holding:
		_hold_time = min(_hold_time + delta, hold_duration)
	else:
		_hold_time = move_toward(_hold_time, 0.0, delta * 1.9)

	var progress := 0.0 if hold_duration <= 0.0 else _hold_time / hold_duration
	prompt.set_prompt_visible(near_item and _talking_to_npc == null)
	prompt.set_progress(progress)
	_position_prompt()
	_update_item_idle(delta, near_item)

	if can_interact and progress >= 1.0:
		_hold_time = 0.0
		prompt.set_progress(0.0)
		_trigger_item()


# ── NPC proximity and talk ────────────────────────────────────────────────────

func _update_npc_proximity() -> void:
	# Find nearest NPC
	var closest: Node2D = null
	var closest_dist := INF
	for npc in _npcs:
		if not is_instance_valid(npc):
			continue
		var d := player.global_position.distance_to(npc.global_position)
		if d < closest_dist:
			closest_dist = d
			closest = npc

	_nearest_npc = closest if closest_dist <= talk_distance else null

	# Auto-end conversation if player walked away
	if _talking_to_npc != null and is_instance_valid(_talking_to_npc):
		var dist_to_talking := player.global_position.distance_to(_talking_to_npc.global_position)
		if dist_to_talking > talk_distance * 1.5:
			_end_conversation()

	# Show/hide NPC talk prompt
	var show_talk := _nearest_npc != null and _talking_to_npc == null
	if _npc_talk_prompt != null:
		_npc_talk_prompt.visible = show_talk
		if show_talk and _nearest_npc != null:
			var screen_pos := get_viewport().get_canvas_transform() * _nearest_npc.global_position
			_npc_talk_prompt.position = screen_pos + Vector2(-_npc_talk_prompt.size.x * 0.5, -100.0)

	# M key: start or end conversation
	if Input.is_action_just_pressed("ui_cancel"):
		pass  # reserved
	if Input.is_key_pressed(KEY_M) and not _m_was_pressed:
		_m_was_pressed = true
		if _talking_to_npc != null:
			_end_conversation()
		elif _nearest_npc != null and not _conversation_busy:
			_start_conversation(_nearest_npc)
	elif not Input.is_key_pressed(KEY_M):
		_m_was_pressed = false

func _start_conversation(npc: Node2D) -> void:
	_conversation_busy = true
	_talking_to_npc = npc
	if npc.has_method("set_talking"):
		npc.call("set_talking", true)
	var npc_role: String = npc.get("role") if npc.get("role") != null else ""
	if npc_role == "":
		push_warning("[main_scene] NPC has no role property: %s" % npc.name)
		return
	GameSessionManager.start_npc_conversation(npc_role, _current_round, _current_phase)


func _end_conversation() -> void:
	if _talking_to_npc != null and is_instance_valid(_talking_to_npc):
		if _talking_to_npc.has_method("set_talking"):
			_talking_to_npc.call("set_talking", false)
	_talking_to_npc = null

	# Tell WebView to leave first, then the backend will be called in signal handler
	if _voice_webview != null:
		_awaiting_voice_leave = true
		_voice_webview.call("post_message", JSON.stringify({ "action": "leave" }))
		_leave_fallback_timer = get_tree().create_timer(3.0)
		_leave_fallback_timer.timeout.connect(_on_leave_fallback_timeout)
	else:
		GameSessionManager.end_npc_conversation()


func _on_leave_fallback_timeout() -> void:
	if not _awaiting_voice_leave:
		return
	_awaiting_voice_leave = false
	GameSessionManager.end_npc_conversation()


# ── WebView voice bridge ──────────────────────────────────────────────────────

func _setup_voice_webview() -> void:
	if not ClassDB.class_exists("WebView"):
		# No WRY plugin — will use OS.shell_open() browser fallback instead
		push_warning("[main_scene] WRY not found — using browser fallback for voice.")
		return
	_voice_webview = ClassDB.instantiate("WebView")
	if _voice_webview == null:
		push_warning("[main_scene] Could not instantiate WebView — using browser fallback.")
		return

	var host := Control.new()
	host.name = "VoiceWebViewHost"
	host.set_anchors_preset(Control.PRESET_TOP_LEFT)
	host.size = Vector2(1, 1)
	host.position = Vector2(-10, -10)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(host)
	host.add_child(_voice_webview)
	_voice_webview.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_voice_webview.size = Vector2(1, 1)
	_voice_webview.position = Vector2.ZERO
	_voice_webview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_voice_webview.set("full_window_size", false)
	_voice_webview.set("autoplay", true)
	_voice_webview.set("forward_input_events", true)
	if _voice_webview.has_signal("ipc_message"):
		_voice_webview.connect("ipc_message", Callable(self, "_on_voice_ipc"))
	call_deferred("_load_voice_page")


func _load_voice_page() -> void:
	if _voice_webview == null or not _voice_webview.has_method("load_url"):
		return
	_voice_webview.call("load_url", GameSessionManager.SERVER_URL + "/agora-voice")


func _on_voice_ipc(message: String) -> void:
	print("[main_scene] IPC from voice page: ", message)
	var data = JSON.parse_string(message)
	if typeof(data) != TYPE_DICTIONARY:
		return
	var msg_type := str(data.get("type", ""))
	if msg_type == "voice_page" and str(data.get("status", "")) == "ready":
		_webview_page_ready = true
		if _pending_join_msg != "":
			_voice_webview.call("post_message", _pending_join_msg)
			_pending_join_msg = ""
	if msg_type == "voice_status":
		var st := str(data.get("status", ""))
		if st == "left" and _awaiting_voice_leave:
			_awaiting_voice_leave = false
			GameSessionManager.end_npc_conversation()


# ── Session manager signal handlers ──────────────────────────────────────────

func _connect_session_manager() -> void:
	GameSessionManager.session_initialized.connect(_on_session_initialized)
	GameSessionManager.npc_session_started.connect(_on_npc_session_started)
	GameSessionManager.npc_session_ended.connect(_on_npc_session_ended)
	GameSessionManager.server_error.connect(_on_server_error)


func _on_session_initialized(_npcs: Array) -> void:
	if _server_error_label != null:
		_server_error_label.visible = false


func _on_npc_session_started(_npc_id: String, app_id: String, channel: String, rtc_token: String, player_uid: int) -> void:
	if _voice_webview == null:
		# Browser fallback: open voice page with join params in URL
		var url := "%s/agora-voice?appId=%s&channel=%s&token=%s&uid=%d" % [
			GameSessionManager.SERVER_URL,
			app_id.uri_encode(),
			channel.uri_encode(),
			rtc_token.uri_encode(),
			player_uid,
		]
		OS.shell_open(url)
		return
	var msg := {
		"action": "join",
		"appId": app_id,
		"channel": channel,
		"token": rtc_token,
		"uid": player_uid,
	}
	var json_msg := JSON.stringify(msg)
	_voice_webview.call("post_message", json_msg)
	_pending_join_msg = json_msg


func _on_npc_session_ended(npc_id: String, breakdown: int, trust: int, tier: String, journal_entry: Dictionary) -> void:
	_conversation_busy = false
	var journal := get_node_or_null("UI/Overlay/Journal")
	if journal == null:
		journal = find_child("Journal", true, false)
	if journal != null and journal.has_method("add_evidence_entry"):
		var entry_content: String = str(journal_entry.get("content", ""))
		if entry_content != "":
			journal.call("add_evidence_entry", entry_content)
	if journal != null and journal.has_method("update_npc_status") and npc_id != "":
		# Map NPC id to display name
		var npc_names: Dictionary = { "butler": "Edwin (Butler)", "chef": "Rosa (Chef)", "gardener": "Moss (Gardener)", "maid": "Clara (Maid)" }
		var display_name: String = npc_names.get(npc_id, npc_id.capitalize())
		journal.call("update_npc_status", npc_id, display_name, trust, breakdown, tier)


func _on_server_error(endpoint: String, message: String) -> void:
	_conversation_busy = false
	push_warning("[main_scene] Server error at %s: %s" % [endpoint, message])
	if _server_error_label != null:
		_server_error_label.text = "Backend offline — run: npm run agora:server"
		_server_error_label.visible = true


# ── Blackout integration (called by main_scene_controller) ───────────────────

func force_end_conversation_for_blackout() -> void:
	if _talking_to_npc != null:
		_end_conversation()


# ── Setup helpers ─────────────────────────────────────────────────────────────

func _setup_npc_talk_prompt() -> void:
	_npc_talk_prompt = Label.new()
	_npc_talk_prompt.name = "NpcTalkPrompt"
	_npc_talk_prompt.add_theme_font_override("font", PROMPT_FONT)
	_npc_talk_prompt.add_theme_font_size_override("font_size", 22)
	_npc_talk_prompt.add_theme_color_override("font_color", Color(0.988235, 0.956863, 0.835294, 1))
	_npc_talk_prompt.add_theme_color_override("font_outline_color", Color(0.164706, 0.145098, 0.133333, 1))
	_npc_talk_prompt.add_theme_constant_override("outline_size", 5)
	_npc_talk_prompt.text = "Talk [M]"
	_npc_talk_prompt.visible = false
	_npc_talk_prompt.z_index = 10
	overlay.add_child(_npc_talk_prompt)


func _setup_server_error_label() -> void:
	_server_error_label = Label.new()
	_server_error_label.name = "ServerErrorLabel"
	_server_error_label.add_theme_font_override("font", PROMPT_FONT)
	_server_error_label.add_theme_font_size_override("font_size", 18)
	_server_error_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4, 1))
	_server_error_label.add_theme_color_override("font_outline_color", Color(0.1, 0.05, 0.05, 1))
	_server_error_label.add_theme_constant_override("outline_size", 4)
	_server_error_label.text = "Backend offline — run: npm run agora:server"
	_server_error_label.position = Vector2(12, 12)
	_server_error_label.visible = false
	overlay.add_child(_server_error_label)


func _position_prompt() -> void:
	var screen_position: Vector2 = get_viewport().get_canvas_transform() * item.global_position
	prompt.position = screen_position + Vector2(-prompt.size.x * 0.5, -132.0 + prompt.bob_offset)


func _update_item_idle(delta: float, near_item: bool) -> void:
	if _is_animating():
		return

	var hover_strength := 1.0 if near_item else 0.35
	item.rotation = lerpf(item.rotation, sin(Time.get_ticks_msec() / 280.0) * 0.02 * hover_strength, delta * 5.0)
	item.scale = item.scale.lerp(Vector2.ONE * (1.05 if near_item else 1.0), delta * 6.0)
	item_badge.scale = item_badge.scale.lerp(Vector2.ONE * (1.14 if _item_open else 1.0), delta * 6.0)
	item_badge.rotation = lerpf(item_badge.rotation, 0.16 if _item_open else 0.0, delta * 6.0)

	var target_alpha := 0.92 if _item_open else (0.22 if near_item else 0.0)
	var glow_modulate := item_glow.modulate
	glow_modulate.a = move_toward(glow_modulate.a, target_alpha, delta * 1.8)
	item_glow.modulate = glow_modulate


func _trigger_item() -> void:
	if _interaction_tween != null and _interaction_tween.is_valid():
		_interaction_tween.kill()

	_item_open = not _item_open
	prompt.flash()

	_interaction_tween = create_tween()
	_interaction_tween.set_parallel(true)
	_interaction_tween.tween_property(item, "scale", Vector2(1.13, 0.9), 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_interaction_tween.chain().tween_property(item, "scale", Vector2.ONE * (1.05 if _item_open else 1.0), 0.26).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	_interaction_tween.tween_property(item_lid, "rotation", -0.52 if _item_open else 0.0, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_interaction_tween.finished.connect(_finish_interaction)


func _finish_interaction() -> void:
	_interaction_tween = null


func _is_animating() -> bool:
	return _interaction_tween != null and _interaction_tween.is_valid() and _interaction_tween.is_running()


func _setup_voice_prompt() -> void:
	_voice_prompt = Control.new()
	_voice_prompt.name = "VoicePrompt"
	_voice_prompt.set_script(VOICE_PROMPT_SCRIPT)
	_voice_prompt.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_voice_prompt.offset_left = 22.0
	_voice_prompt.offset_top = -118.0
	_voice_prompt.offset_right = 114.0
	_voice_prompt.offset_bottom = -26.0

	var label := Label.new()
	label.name = "PromptLabel"
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	label.add_theme_font_override("font", PROMPT_FONT)
	label.add_theme_font_size_override("font_size", 34)
	label.add_theme_color_override("font_color", Color(0.988235, 0.956863, 0.835294, 1))
	label.add_theme_color_override("font_outline_color", Color(0.164706, 0.145098, 0.133333, 1))
	label.add_theme_constant_override("outline_size", 6)
	label.text = "M"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	label.position = Vector2(0.0, 6.0)

	_voice_prompt.add_child(label)
	overlay.add_child(_voice_prompt)


func _setup_npcs() -> void:
	var room_points := {
		"library": Vector2(300.0, 222.0),
		"parlor": Vector2(522.0, 224.0),
		"study": Vector2(850.0, 226.0),
		"kitchen": Vector2(298.0, 418.0),
		"atrium": Vector2(618.0, 408.0),
		"dining": Vector2(932.0, 418.0),
		"hall_west": Vector2(330.0, 382.0),
		"hall_center": Vector2(618.0, 386.0),
		"hall_east": Vector2(892.0, 382.0),
		"ballroom": Vector2(640.0, 590.0),
	}

	_npcs.clear()
	for npc_path in [
		^"World/Actors/Chef",
		^"World/Actors/Butler",
		^"World/Actors/Maid",
		^"World/Actors/Gardener",
	]:
		var npc := get_node_or_null(npc_path)
		if npc != null:
			if npc.has_method("configure"):
				npc.call("configure", room_points)
			_npcs.append(npc)
