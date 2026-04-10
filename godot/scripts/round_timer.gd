extends Control

@export_range(5.0, 300.0, 1.0) var round_duration_seconds := 60.0
@export_range(3.0, 60.0, 1.0) var warning_threshold_seconds := 15.0
@export var auto_start := true

@onready var timer_value: Label = $Backplate/Dial/TimerValue
@onready var progress_fill: PanelContainer = $Backplate/ProgressTrack/ProgressFill
@onready var frame: PanelContainer = $Backplate
@onready var crown: PanelContainer = $Backplate/Crown
@onready var warning_gem: ColorRect = $Backplate/GemSocket/WarningGem

const NORMAL_TIME_COLOR := Color("1a1411")
const WARNING_TIME_COLOR := Color("fff2d0")
const NORMAL_FILL_COLOR := Color("87603b")
const WARNING_FILL_COLOR := Color("b24d34")
const NORMAL_PANEL_COLOR := Color("211b17")
const WARNING_PANEL_COLOR := Color("4b241e")
const NORMAL_GEM_COLOR := Color("423126")
const WARNING_GEM_COLOR := Color("d26a44")

var time_remaining := 0.0
var running := false
var default_scale := Vector2.ONE
var base_fill_width := 92.0


func _ready() -> void:
	default_scale = timer_value.scale
	reset(round_duration_seconds)


func _process(delta: float) -> void:
	if Engine.is_editor_hint() or not running:
		return

	time_remaining = maxf(time_remaining - delta, 0.0)
	_update_display()

	if is_zero_approx(time_remaining):
		running = false


func reset(duration_seconds: float = round_duration_seconds) -> void:
	round_duration_seconds = maxf(duration_seconds, 1.0)
	time_remaining = round_duration_seconds
	running = auto_start
	_update_display()


func start() -> void:
	running = true


func stop() -> void:
	running = false


func _update_display() -> void:
	var total_seconds := int(ceil(time_remaining))
	var minutes := int(total_seconds / 60.0)
	var seconds := total_seconds % 60
	var progress := clampf(time_remaining / round_duration_seconds, 0.0, 1.0)
	var warning_active := time_remaining <= warning_threshold_seconds
	var pulse := 1.0

	if warning_active and running:
		pulse = 0.88 + (sin(Time.get_ticks_msec() / 115.0) + 1.0) * 0.09

	timer_value.text = "%02d:%02d" % [minutes, seconds]
	progress_fill.custom_minimum_size.x = maxf(base_fill_width * progress, 8.0)
	timer_value.scale = default_scale * pulse

	_apply_palette(warning_active, pulse)


func _apply_palette(warning_active: bool, pulse: float) -> void:
	if warning_active:
		frame.self_modulate = Color(1.0, 0.95, 0.92, 1.0)
		(progress_fill.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = WARNING_FILL_COLOR
		timer_value.modulate = WARNING_TIME_COLOR
		warning_gem.color = WARNING_GEM_COLOR.lerp(Color(1.0, 0.87, 0.7, 1.0), pulse * 0.35)
		crown.self_modulate = Color(1.0, 0.86, 0.78, 0.92 + pulse * 0.06)
		(frame.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = WARNING_PANEL_COLOR
	else:
		frame.self_modulate = Color.WHITE
		(progress_fill.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = NORMAL_FILL_COLOR
		timer_value.modulate = NORMAL_TIME_COLOR
		warning_gem.color = NORMAL_GEM_COLOR
		crown.self_modulate = Color.WHITE
		(frame.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = NORMAL_PANEL_COLOR
