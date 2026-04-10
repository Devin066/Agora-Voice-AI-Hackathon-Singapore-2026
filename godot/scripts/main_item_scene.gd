extends Node2D

@export var interact_distance := 104.0
@export var hold_duration := 0.8

@onready var player: CharacterBody2D = $World/Actors/Player
@onready var item: Node2D = $World/Actors/InteractableItem
@onready var item_lid: Node2D = $World/Actors/InteractableItem/Lid
@onready var item_glow: CanvasItem = $World/Actors/InteractableItem/ClueGlow
@onready var item_badge: Node2D = $World/Actors/InteractableItem/Badge
@onready var prompt = $UI/Overlay/InteractPrompt
@onready var hint: Label = $UI/Overlay/Hint

var _hold_time := 0.0
var _item_open := false
var _interaction_tween: Tween


func _ready() -> void:
	prompt.set_prompt_visible(false)
	prompt.set_progress(0.0)
	var glow_modulate := item_glow.modulate
	glow_modulate.a = 0.0
	item_glow.modulate = glow_modulate
	hint.text = "Arrow keys move. Hold E near the crate to inspect it."


func _process(delta: float) -> void:
	var near_item := player.global_position.distance_to(item.global_position) <= interact_distance
	var can_interact := near_item and not _is_animating()
	var is_holding := can_interact and Input.is_key_pressed(KEY_E)

	if is_holding:
		_hold_time = min(_hold_time + delta, hold_duration)
	else:
		_hold_time = move_toward(_hold_time, 0.0, delta * 1.9)

	var progress := 0.0 if hold_duration <= 0.0 else _hold_time / hold_duration
	prompt.set_prompt_visible(near_item)
	prompt.set_progress(progress)
	_position_prompt()
	_update_item_idle(delta, near_item)

	if can_interact and progress >= 1.0:
		_hold_time = 0.0
		prompt.set_progress(0.0)
		_trigger_item()


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
	hint.text = "The crate is %s. Hold E again to %s it." % [
		"open" if _item_open else "closed",
		"close" if _item_open else "open"
	]

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
