extends Node2D

@export_file("*.tscn") var next_scene_path := "res://scenes/main.tscn"
@export var prompt_distance := 150.0

@onready var player: CharacterBody2D = $World/Actors/Player
@onready var prompt: Control = $UI/Overlay/InteractPrompt
@onready var prompt_label: Label = $UI/Overlay/InteractPrompt/PromptLabel
@onready var prompt_anchor: Marker2D = $World/DoorPromptAnchor
@onready var door_threshold: Area2D = $World/DoorThreshold
@onready var door_glow: Polygon2D = $World/DoorGlow
@onready var fade_rect: ColorRect = $UI/Overlay/Fade

var _transitioning := false
var _door_glow_base_alpha := 0.0


func _ready() -> void:
	prompt_label.text = "GO"
	prompt.set_prompt_visible(false)
	prompt.set_progress(0.0)
	_door_glow_base_alpha = door_glow.color.a
	door_threshold.body_entered.connect(_on_door_body_entered)


func _process(delta: float) -> void:
	if _transitioning:
		prompt.set_prompt_visible(false)
		prompt.set_progress(0.0)
		return

	var distance_to_door := player.global_position.distance_to(prompt_anchor.global_position)
	var near_door := distance_to_door <= prompt_distance
	prompt.set_prompt_visible(near_door)
	prompt.set_progress(0.0)
	_position_prompt()

	var pulse := 0.85 + sin(Time.get_ticks_msec() / 180.0) * 0.15
	var target_alpha := _door_glow_base_alpha * (1.7 if near_door else 1.0) * pulse
	var glow_color := door_glow.color
	glow_color.a = move_toward(glow_color.a, target_alpha, delta * 1.8)
	door_glow.color = glow_color


func _position_prompt() -> void:
	var screen_position: Vector2 = get_viewport().get_canvas_transform() * prompt_anchor.global_position
	prompt.position = screen_position + Vector2(-prompt.size.x * 0.5, -86.0 + prompt.bob_offset)


func _on_door_body_entered(body: Node) -> void:
	if body != player or _transitioning:
		return

	_transitioning = true
	player.set_physics_process(false)

	var fade_tween := create_tween()
	fade_tween.set_trans(Tween.TRANS_SINE)
	fade_tween.set_ease(Tween.EASE_IN_OUT)
	fade_tween.tween_property(fade_rect, "color:a", 1.0, 0.35)
	await fade_tween.finished

	get_tree().change_scene_to_file(next_scene_path)
