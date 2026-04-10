extends Control

@export_file("*.tscn") var next_scene_path := "res://scenes/start_sequence.tscn"

@onready var start_button: Button = $SafeFrame/StartButton


func _ready() -> void:
	start_button.pressed.connect(_on_start_pressed)


func _on_start_pressed() -> void:
	get_tree().change_scene_to_file(next_scene_path)
