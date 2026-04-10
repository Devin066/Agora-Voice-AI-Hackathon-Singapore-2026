extends Control

@export var prompt_text := "M"
@export var active := true

var _time := 0.0

@onready var _label: Label = $PromptLabel


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.text = prompt_text
	queue_redraw()


func set_active(value: bool) -> void:
	active = value


func set_prompt_text(value: String) -> void:
	prompt_text = value
	if _label != null:
		_label.text = prompt_text


func _process(delta: float) -> void:
	_time += delta
	var pulse := 1.0 + sin(_time * 5.6) * 0.025
	scale = Vector2.ONE * pulse
	modulate.a = move_toward(modulate.a, 1.0 if active else 0.78, delta * 4.0)
	queue_redraw()


func _draw() -> void:
	var center := Vector2(46.0, 46.0)
	var radius := 29.0
	var width := 8.0
	var shell_color := Color(0.145, 0.137, 0.133, 0.92)
	var rim_color := Color(0.63, 0.63, 0.64, 0.95)
	var accent_color := Color(0.93, 0.88, 0.68, 1.0) if active else Color(0.48, 0.51, 0.55, 1.0)

	draw_circle(center, radius - width * 0.55, shell_color)
	draw_arc(center, radius, 0.0, TAU, 48, rim_color, width, true)
	draw_circle(center + Vector2(-12.0, -12.0), radius * 0.18, Color(1, 1, 1, 0.08))

	_draw_mic_icon(center + Vector2(0.0, 17.0), accent_color)


func _draw_mic_icon(origin: Vector2, color: Color) -> void:
	var outline := Color(0.11, 0.1, 0.1, 0.95)
	var head := Rect2(origin + Vector2(-7.0, -20.0), Vector2(14.0, 17.0))
	var stem := Rect2(origin + Vector2(-2.0, -3.0), Vector2(4.0, 10.0))
	var base := Rect2(origin + Vector2(-8.0, 8.0), Vector2(16.0, 4.0))

	draw_rect(head.grow(2.0), outline)
	draw_rect(head, color)
	draw_rect(Rect2(origin + Vector2(-9.0, -16.0), Vector2(2.0, 9.0)), Color(1, 1, 1, 0.08))
	draw_rect(stem.grow(1.0), outline)
	draw_rect(stem, color.darkened(0.12))
	draw_rect(base.grow(1.0), outline)
	draw_rect(base, color.darkened(0.18))
	draw_arc(origin + Vector2(0.0, -11.0), 12.0, deg_to_rad(20.0), deg_to_rad(160.0), 18, color, 3.0, true)
