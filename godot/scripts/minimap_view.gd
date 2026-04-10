extends Control

@export var map_padding := Vector2(16.0, 16.0)
@export var player_marker_radius := 6.0
@export var label_font: Font

var _player: Node2D
var _walk_plane: Polygon2D
var _landmarks: Array[Node2D] = []
var _landmark_labels: PackedStringArray = []
var _world_bounds := Rect2(Vector2.ZERO, Vector2.ONE)


func configure(
	player: Node2D,
	walk_plane: Polygon2D,
	landmarks: Array,
	labels: PackedStringArray
) -> void:
	_player = player
	_walk_plane = walk_plane
	_landmarks.clear()
	for landmark in landmarks:
		if landmark is Node2D:
			_landmarks.append(landmark)
	_landmark_labels = labels
	_recompute_bounds()
	queue_redraw()


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var content_rect := Rect2(map_padding, size - map_padding * 2.0)
	if content_rect.size.x <= 0.0 or content_rect.size.y <= 0.0:
		return

	draw_rect(content_rect, Color(0.0352941, 0.0509804, 0.0745098, 0.92), true)
	draw_rect(content_rect, Color(0.572549, 0.721569, 0.745098, 0.28), false, 2.0)

	if _walk_plane and _walk_plane.polygon.size() >= 3:
		var polygon_points := PackedVector2Array()
		for point in _walk_plane.polygon:
			polygon_points.append(_world_to_map(_walk_plane.to_global(point), content_rect))
		draw_colored_polygon(polygon_points, Color(0.447059, 0.639216, 0.568627, 0.46))
		draw_polyline(polygon_points, Color(0.913725, 0.972549, 0.87451, 0.8), 2.0, true)

	_draw_landmarks(content_rect)

	if _player:
		var marker := _world_to_map(_player.global_position, content_rect)
		draw_circle(marker, player_marker_radius + 3.0, Color(0.0313726, 0.0392157, 0.0470588, 0.86))
		draw_circle(marker, player_marker_radius, Color(0.980392, 0.87451, 0.521569, 1))


func _draw_landmarks(content_rect: Rect2) -> void:
	for index in _landmarks.size():
		var landmark := _landmarks[index]
		if not landmark:
			continue

		var point := _world_to_map(landmark.global_position, content_rect)
		draw_circle(point, 3.5, Color(0.705882, 0.901961, 0.913725, 0.95))

		if index < _landmark_labels.size():
			var font := label_font if label_font else ThemeDB.fallback_font
			if font:
				draw_string(
					font,
					point + Vector2(8.0, -5.0),
					_landmark_labels[index],
					HORIZONTAL_ALIGNMENT_LEFT,
					-1.0,
					12,
					Color(0.843137, 0.917647, 0.92549, 0.92)
				)


func _recompute_bounds() -> void:
	if not _walk_plane or _walk_plane.polygon.is_empty():
		_world_bounds = Rect2(Vector2.ZERO, Vector2.ONE)
		return

	var min_x := INF
	var min_y := INF
	var max_x := -INF
	var max_y := -INF

	for point in _walk_plane.polygon:
		var world_point := _walk_plane.to_global(point)
		min_x = min(min_x, world_point.x)
		min_y = min(min_y, world_point.y)
		max_x = max(max_x, world_point.x)
		max_y = max(max_y, world_point.y)

	_world_bounds = Rect2(
		Vector2(min_x, min_y),
		Vector2(max(max_x - min_x, 1.0), max(max_y - min_y, 1.0))
	)


func _world_to_map(world_position: Vector2, content_rect: Rect2) -> Vector2:
	var normalized := Vector2(
		(world_position.x - _world_bounds.position.x) / _world_bounds.size.x,
		(world_position.y - _world_bounds.position.y) / _world_bounds.size.y
	)

	return content_rect.position + normalized * content_rect.size
