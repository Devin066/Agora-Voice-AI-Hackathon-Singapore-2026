extends Control

@export_range(0.0, 1.0, 0.01) var progress := 0.0

var bob_offset := 0.0

var _target_visible := false
var _display_amount := 0.0
var _time := 0.0

@onready var _label: Label = $PromptLabel


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	pivot_offset = size * 0.5
	visible = false


func set_prompt_visible(value: bool) -> void:
	_target_visible = value


func set_progress(value: float) -> void:
	progress = clampf(value, 0.0, 1.0)


func flash() -> void:
	_time += 0.35


func _process(delta: float) -> void:
	_time += delta
	_display_amount = move_toward(_display_amount, 1.0 if _target_visible else 0.0, delta * 7.5)
	visible = _display_amount > 0.02
	if not visible:
		bob_offset = 0.0
		return

	bob_offset = -sin(_time * 4.5) * 4.0 * _display_amount
	var pulse := 1.0 + sin(_time * 8.0) * 0.02 * _display_amount + progress * 0.04
	scale = Vector2.ONE * (0.78 + _display_amount * 0.22) * pulse
	modulate.a = _display_amount
	_label.modulate.a = clampf(_display_amount + 0.25, 0.0, 1.0)
	queue_redraw()


func _draw() -> void:
	if _display_amount <= 0.0:
		return

	var center: Vector2 = size * 0.5
	var radius: float = minf(size.x, size.y) * 0.32
	var width: float = 8.0

	draw_circle(center, radius - width * 0.55, Color(0.145, 0.137, 0.133, 0.92))
	draw_arc(center, radius, 0.0, TAU, 48, Color(0.63, 0.63, 0.64, 0.95), width, true)
	if progress > 0.0:
		draw_arc(center, radius, -PI * 0.5, -PI * 0.5 + TAU * progress, 48, Color(0.93, 0.88, 0.68, 1.0), width, true)
	draw_circle(center + Vector2(-12.0, -12.0), radius * 0.18, Color(1, 1, 1, 0.08 * _display_amount))
