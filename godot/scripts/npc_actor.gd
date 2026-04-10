extends Node2D

@export var role := "maid"
@export var move_speed := 58.0
@export var vertical_ratio := 0.62
@export var arrive_distance := 10.0
@export var roam_radius := Vector2(26.0, 14.0)
@export var idle_range := Vector2(1.4, 3.4)

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

const ROLE_SCHEDULES := {
	"chef": {
		"kitchen": 6.0,
		"atrium": 2.5,
		"dining": 3.0,
		"hall_center": 1.6,
		"ballroom": 1.0,
	},
	"butler": {
		"atrium": 4.0,
		"dining": 3.0,
		"parlor": 2.8,
		"hall_center": 2.4,
		"study": 1.7,
		"ballroom": 2.2,
	},
	"maid": {
		"library": 2.3,
		"parlor": 2.8,
		"kitchen": 2.0,
		"hall_west": 2.1,
		"atrium": 2.4,
		"ballroom": 1.8,
	},
	"gardener": {
		"study": 2.2,
		"atrium": 3.0,
		"dining": 1.9,
		"hall_east": 2.0,
		"ballroom": 3.8,
	},
}

var _room_points: Dictionary = {}
var _current_target := Vector2.ZERO
var _idle_timer := 0.0
var _rng := RandomNumberGenerator.new()
var is_talking := false


func _ready() -> void:
	_rng.randomize()
	_current_target = global_position
	_idle_timer = randf_range(idle_range.x, idle_range.y)
	if sprite != null:
		sprite.play("idle")


func configure(room_points: Dictionary) -> void:
	_room_points = room_points.duplicate(true)
	_pick_next_target()


func set_talking(active: bool) -> void:
	is_talking = active
	if sprite != null:
		if active:
			sprite.modulate = Color(1.4, 1.4, 0.8, 1.0)  # Warm glow when talking
			sprite.play("idle")
		else:
			sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)


func _physics_process(delta: float) -> void:
	if _room_points.is_empty() or is_talking:
		return

	var to_target := _current_target - global_position
	if to_target.length() <= arrive_distance:
		_idle_timer -= delta
		if sprite != null:
			sprite.play("idle")
		if _idle_timer <= 0.0:
			_pick_next_target()
		return

	var move_dir := to_target.normalized()
	global_position += Vector2(move_dir.x, move_dir.y * vertical_ratio) * move_speed * delta
	if sprite != null:
		sprite.play("walk")
		if absf(move_dir.x) > 0.08:
			sprite.flip_h = move_dir.x < 0.0


func _pick_next_target() -> void:
	var schedule: Dictionary = ROLE_SCHEDULES.get(role, ROLE_SCHEDULES["maid"])
	var room_name := _weighted_room_pick(schedule)
	var anchor: Vector2 = _room_points.get(room_name, global_position)
	_current_target = anchor + Vector2(
		_rng.randf_range(-roam_radius.x, roam_radius.x),
		_rng.randf_range(-roam_radius.y, roam_radius.y)
	)
	_idle_timer = _rng.randf_range(idle_range.x, idle_range.y)


func _weighted_room_pick(weights: Dictionary) -> String:
	var total := 0.0
	for value in weights.values():
		total += float(value)

	if total <= 0.0:
		return String(_room_points.keys()[0])

	var ticket := _rng.randf_range(0.0, total)
	var running := 0.0
	for room_name in weights.keys():
		running += float(weights[room_name])
		if ticket <= running:
			return String(room_name)

	return String(weights.keys().back())
