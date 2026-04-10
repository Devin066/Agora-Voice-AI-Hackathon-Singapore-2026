extends CharacterBody2D

@export var speed := 240.0
@export var vertical_ratio := 0.58
@export var play_area := Rect2(-430.0, -60.0, 860.0, 500.0)

func _physics_process(_delta: float) -> void:
	var input_vector := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = Vector2(input_vector.x, input_vector.y * vertical_ratio) * speed
	move_and_slide()
	global_position.x = clamp(global_position.x, play_area.position.x, play_area.end.x)
	global_position.y = clamp(global_position.y, play_area.position.y, play_area.end.y)
