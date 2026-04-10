extends CharacterBody2D

@export var speed := 240.0
@export var vertical_ratio := 0.58
@export var play_area := Rect2(-430.0, -60.0, 860.0, 500.0)
@export_node_path("Control") var journal_path: NodePath

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var journal: Control = get_node_or_null(journal_path) as Control

func _physics_process(_delta: float) -> void:
	if Input.is_action_just_pressed("journal_toggle"):
		_toggle_journal()

	if _journal_blocks_movement():
		velocity = Vector2.ZERO
		sprite.play("idle")
		return

	var input_vector := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = Vector2(input_vector.x, input_vector.y * vertical_ratio) * speed
	move_and_slide()
	global_position.x = clamp(global_position.x, play_area.position.x, play_area.end.x)
	global_position.y = clamp(global_position.y, play_area.position.y, play_area.end.y)
	_update_visuals(input_vector)


func _update_visuals(input_vector: Vector2) -> void:
	if input_vector.is_zero_approx():
		sprite.play("idle")
		sprite.flip_h = false
		return

	sprite.play("walk")
	if absf(input_vector.x) > 0.15:
		sprite.flip_h = input_vector.x < 0.0


func _toggle_journal() -> void:
	if journal == null:
		return

	if journal.has_method("toggle_journal"):
		journal.call("toggle_journal")
		return

	journal.visible = not journal.visible


func _journal_blocks_movement() -> bool:
	if journal == null or not journal.visible:
		return false

	if journal.has_method("is_open"):
		return bool(journal.call("is_open"))

	return journal.visible
