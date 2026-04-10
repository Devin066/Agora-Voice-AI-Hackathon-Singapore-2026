extends Node2D

enum RoundPhase {
	INVESTIGATION,
	BLACKOUT,
}

@export var investigation_duration := 60.0
@export var blackout_duration := 10.0
@export var blackout_peak_alpha := 0.76

@onready var hint_label: Label = $UI/Overlay/Hint
@onready var blackout_overlay: ColorRect = $UI/Overlay/BlackoutOverlay
@onready var timer_label: Label = $UI/Overlay/HUD/TimerPanel/TimerMargin/TimerContent/TimeValue
@onready var phase_label: Label = $UI/Overlay/HUD/TimerPanel/TimerMargin/TimerContent/PhaseLabel
@onready var timer_bar: ProgressBar = $UI/Overlay/HUD/TimerPanel/TimerMargin/TimerContent/TimeBar
@onready var status_label: Label = $UI/Overlay/HUD/TimerPanel/TimerMargin/TimerContent/StatusLabel
@onready var minimap: Control = $UI/Overlay/HUD/MinimapPanel/MinimapMargin/MinimapContent/Minimap

var _phase: RoundPhase = RoundPhase.INVESTIGATION
var _time_left := 0.0
var _round_number := 1


func _ready() -> void:
	if minimap.has_method("configure"):
		minimap.call(
			"configure",
			$World/Actors/Player,
			$World/WalkPlane,
			[$World/WellStone, $World/ToriiBeam],
			PackedStringArray(["Well", "Gate"])
		)

	_start_investigation()


func _process(delta: float) -> void:
	_time_left = max(_time_left - delta, 0.0)
	_update_timer_ui()
	_update_blackout_overlay(delta)

	if _time_left > 0.0:
		return

	if _phase == RoundPhase.INVESTIGATION:
		_start_blackout()
	else:
		_round_number += 1
		_start_investigation()


func _start_investigation() -> void:
	_phase = RoundPhase.INVESTIGATION
	_time_left = investigation_duration
	hint_label.text = "Arrow keys move the detective. Use the minimap to track your route before blackout."
	status_label.text = "Round %d. Search the grounds before lights-out." % _round_number
	phase_label.text = "INVESTIGATION"
	timer_bar.modulate = Color(0.729412, 0.937255, 0.729412, 1)
	_update_timer_ui()


func _start_blackout() -> void:
	_phase = RoundPhase.BLACKOUT
	_time_left = blackout_duration
	hint_label.text = "Blackout. Murders can happen now, so keep your bearings."
	status_label.text = "Blackout active. Listen for movement and commit the map to memory."
	phase_label.text = "BLACKOUT"
	timer_bar.modulate = Color(1, 0.564706, 0.447059, 1)
	_update_timer_ui()
	# Force-end any active NPC conversation during blackout
	if GameSessionManager.active_npc_id != "":
		var main := get_node_or_null("/root/main")
		if main != null and main.has_method("force_end_conversation_for_blackout"):
			main.call("force_end_conversation_for_blackout")


func _update_timer_ui() -> void:
	var duration := investigation_duration if _phase == RoundPhase.INVESTIGATION else blackout_duration
	var ratio := 0.0
	if duration > 0.0:
		ratio = _time_left / duration

	timer_label.text = _format_time(_time_left)
	timer_bar.value = ratio * timer_bar.max_value


func _update_blackout_overlay(delta: float) -> void:
	var target_alpha := 0.0
	if _phase == RoundPhase.BLACKOUT:
		var pulse := 0.9 + 0.1 * sin(Time.get_ticks_msec() * 0.008)
		target_alpha = blackout_peak_alpha * pulse

	blackout_overlay.color.a = lerpf(blackout_overlay.color.a, target_alpha, min(delta * 3.0, 1.0))


func _format_time(seconds_left: float) -> String:
	var total_seconds := int(ceil(seconds_left))
	var minutes := int(total_seconds / 60.0)
	var seconds := total_seconds % 60
	return "%02d:%02d" % [minutes, seconds]
