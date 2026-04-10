extends Control

const CLOSED_OFFSETS := {
	"left": -126.0,
	"top": -248.0,
	"right": 610.0,
	"bottom": 324.0,
}

const OPEN_OFFSETS := {
	"left": -812.0,
	"top": -262.0,
	"right": -76.0,
	"bottom": 310.0,
}

const CLOSED_ROTATION := 0.0
const OPEN_ROTATION := 0.0
const CLOSED_SCALE := Vector2(0.93, 0.93)
const OPEN_SCALE := Vector2.ONE
const CLOSED_BACKDROP_ALPHA := 0.0
const OPEN_BACKDROP_ALPHA := 0.5
const CLOSED_BOOKMARK_ALPHA := 0.0
const OPEN_BOOKMARK_ALPHA := 1.0
const CLOSED_BOOKMARK_ROTATION := 0.0
const OPEN_BOOKMARK_ROTATION := 0.0
const TRANSITION_DURATION := 0.2

# Suspect index → NPC ID mapping (matches journal.tscn dropdown order)
const SUSPECT_NPC_IDS := ["", "butler", "chef", "gardener", "maid"]
# Weapon index → backend weapon string
const WEAPON_IDS := ["", "candlestick", "kitchen knife", "silk cord", "broken glass shard"]
# Location index → backend room string
const LOCATION_IDS := ["", "library", "kitchen", "dining", "ballroom"]

const THEORY_DEFAULT := "[i]The killer knew the manor layout and moved during blackout. Speak to the suspects and build your case from their words and movement.[/i]\n\n[b]Current read:[/b] Interrogate the staff. Watch for contradictions and track who breaks down under pressure."

@onready var backdrop: ColorRect = $Backdrop
@onready var journal_shell: PanelContainer = $JournalShell
@onready var bookmark: Control = $JournalShell/Bookmark
@onready var phase_summary: Label = $JournalShell/Margin/Book/LeftPage/CaseStatus/CaseStatusPadding/CaseStatusBody/PhaseSummary
@onready var phase_hint: Label = $JournalShell/Margin/Book/LeftPage/CaseStatus/CaseStatusPadding/CaseStatusBody/PhaseHint
@onready var theory_text: RichTextLabel = $JournalShell/Margin/Book/LeftPage/TheoryPanel/TheoryPadding/TheoryBody/TheoryText
@onready var trust_list: RichTextLabel = $JournalShell/Margin/Book/LeftPage/TheoryPanel/TheoryPadding/TheoryBody/TrustList
@onready var evidence_action_text: Label = $JournalShell/Margin/Book/RightPage/Evidence/EvidenceActionText
@onready var pin_clue_button: Button = $JournalShell/Margin/Book/RightPage/Evidence/EvidenceFooter/PinClueButton
@onready var cross_check_button: Button = $JournalShell/Margin/Book/RightPage/Evidence/EvidenceFooter/CrossCheckButton
@onready var suspect_choice: OptionButton = $JournalShell/Margin/Book/RightPage/Case/CaseSlots/SuspectSlot/SuspectSlotPadding/SuspectSlotBody/SuspectChoice
@onready var weapon_choice: OptionButton = $JournalShell/Margin/Book/RightPage/Case/CaseSlots/WeaponSlot/WeaponSlotPadding/WeaponSlotBody/WeaponChoice
@onready var location_choice: OptionButton = $JournalShell/Margin/Book/RightPage/Case/CaseSlots/LocationSlot/LocationSlotPadding/LocationSlotBody/LocationChoice
@onready var accusation_note_text: Label = $JournalShell/Margin/Book/RightPage/Case/AccusationNote/AccusationNotePadding/AccusationNoteText
@onready var case_summary: Label = $JournalShell/Margin/Book/RightPage/Case/CaseSummary
@onready var clear_case_button: Button = $JournalShell/Margin/Book/RightPage/Case/CaseActions/ClearCaseButton
@onready var submit_accusation_button: Button = $JournalShell/Margin/Book/RightPage/Case/CaseActions/SubmitAccusationButton

var pinned_clue_index := -1
var is_journal_open := false
var _evidence_entries: Array[String] = []
var _npc_statuses: Dictionary = {}  # npc_id -> {name, trust, breakdown, tier}


func _ready() -> void:
	pin_clue_button.pressed.connect(_on_pin_clue_pressed)
	cross_check_button.pressed.connect(_on_cross_check_pressed)
	clear_case_button.pressed.connect(_on_clear_case_pressed)
	submit_accusation_button.pressed.connect(_on_submit_accusation_pressed)
	suspect_choice.item_selected.connect(_on_case_selection_changed)
	weapon_choice.item_selected.connect(_on_case_selection_changed)
	location_choice.item_selected.connect(_on_case_selection_changed)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_apply_default_state()
	_apply_pose(false)

	# Connect accusation result signal
	if has_node("/root/GameSessionManager"):
		GameSessionManager.accusation_result.connect(_on_accusation_result)


func _apply_default_state() -> void:
	theory_text.text = THEORY_DEFAULT
	phase_summary.text = "Investigating Blackwell Manor"
	phase_hint.text = "Walk to a suspect and press M to begin a voice interrogation."
	evidence_action_text.text = "No conversations yet — interrogate the suspects."
	accusation_note_text.text = "Speak with the suspects before making your accusation."
	_update_case_summary()


func toggle_journal() -> void:
	set_journal_open(not is_journal_open)


func set_journal_open(should_open: bool) -> void:
	if is_journal_open == should_open:
		return

	is_journal_open = should_open
	_animate_pose()


func is_open() -> bool:
	return is_journal_open


# ── Dynamic evidence from conversations ──────────────────────────────────────

func add_evidence_entry(text: String) -> void:
	if text == "":
		return
	_evidence_entries.append(text)
	# Show the most recent entry in the evidence action text
	evidence_action_text.text = text
	# Update theory with a summary if we have entries
	if _evidence_entries.size() == 1:
		theory_text.text = "[b]First interrogation logged.[/b]\n\n[i]%s[/i]" % text
	elif _evidence_entries.size() >= 2:
		theory_text.text = "[b]%d interrogations logged.[/b]\n\n[i]%s[/i]" % [_evidence_entries.size(), _evidence_entries.back()]


func update_npc_status(npc_id: String, name: String, trust: int, breakdown: int, tier: String) -> void:
	_npc_statuses[npc_id] = { "name": name, "trust": trust, "breakdown": breakdown, "tier": tier }
	_rebuild_trust_list()


func _rebuild_trust_list() -> void:
	if _npc_statuses.is_empty():
		return
	var lines: Array[String] = []
	for npc_id in _npc_statuses:
		var s: Dictionary = _npc_statuses[npc_id]
		var trust_color: String = "#355b52" if s.trust >= 50 else "#8a4f3b"
		var breakdown_color: String = "#8a4f3b" if s.breakdown >= 60 else "#6b7c5a"
		lines.append(
			"%s: Trust [color=%s]%d[/color]  |  Breakdown [color=%s]%d[/color]  [i](%s)[/i]" % [
				s.name, trust_color, s.trust, breakdown_color, s.breakdown, s.tier
			]
		)
	trust_list.text = "\n".join(lines)


# ── Animation ─────────────────────────────────────────────────────────────────

func _apply_pose(opened: bool) -> void:
	var offsets: Dictionary = OPEN_OFFSETS if opened else CLOSED_OFFSETS
	journal_shell.offset_left = offsets.left
	journal_shell.offset_top = offsets.top
	journal_shell.offset_right = offsets.right
	journal_shell.offset_bottom = offsets.bottom
	journal_shell.rotation = OPEN_ROTATION if opened else CLOSED_ROTATION
	journal_shell.scale = OPEN_SCALE if opened else CLOSED_SCALE
	bookmark.modulate.a = OPEN_BOOKMARK_ALPHA if opened else CLOSED_BOOKMARK_ALPHA
	bookmark.rotation = OPEN_BOOKMARK_ROTATION if opened else CLOSED_BOOKMARK_ROTATION
	backdrop.color.a = OPEN_BACKDROP_ALPHA if opened else CLOSED_BACKDROP_ALPHA
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP if opened else Control.MOUSE_FILTER_IGNORE


func _animate_pose() -> void:
	var offsets: Dictionary = OPEN_OFFSETS if is_journal_open else CLOSED_OFFSETS
	var target_rotation: float = OPEN_ROTATION if is_journal_open else CLOSED_ROTATION
	var target_scale: Vector2 = OPEN_SCALE if is_journal_open else CLOSED_SCALE
	var target_backdrop_alpha: float = OPEN_BACKDROP_ALPHA if is_journal_open else CLOSED_BACKDROP_ALPHA
	var target_bookmark_alpha: float = OPEN_BOOKMARK_ALPHA if is_journal_open else CLOSED_BOOKMARK_ALPHA
	var target_bookmark_rotation: float = OPEN_BOOKMARK_ROTATION if is_journal_open else CLOSED_BOOKMARK_ROTATION
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP if is_journal_open else Control.MOUSE_FILTER_IGNORE

	var tween := create_tween().set_parallel(true)
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(journal_shell, "offset_left", offsets.left, TRANSITION_DURATION)
	tween.tween_property(journal_shell, "offset_top", offsets.top, TRANSITION_DURATION)
	tween.tween_property(journal_shell, "offset_right", offsets.right, TRANSITION_DURATION)
	tween.tween_property(journal_shell, "offset_bottom", offsets.bottom, TRANSITION_DURATION)
	tween.tween_property(journal_shell, "rotation", target_rotation, TRANSITION_DURATION)
	tween.tween_property(journal_shell, "scale", target_scale, TRANSITION_DURATION)
	tween.tween_property(bookmark, "modulate:a", target_bookmark_alpha, TRANSITION_DURATION)
	tween.tween_property(bookmark, "rotation", target_bookmark_rotation, TRANSITION_DURATION)
	tween.tween_property(backdrop, "color:a", target_backdrop_alpha, TRANSITION_DURATION)


# ── Button handlers ───────────────────────────────────────────────────────────

func _on_pin_clue_pressed() -> void:
	if _evidence_entries.is_empty():
		evidence_action_text.text = "No evidence logged yet — interrogate suspects first."
		return

	pinned_clue_index = (pinned_clue_index + 1) % _evidence_entries.size()
	evidence_action_text.text = "Pinned: %s" % _evidence_entries[pinned_clue_index]


func _on_cross_check_pressed() -> void:
	if _evidence_entries.is_empty():
		theory_text.text = "[i]No conversations logged yet. Interrogate the suspects to build a case.[/i]"
		return
	theory_text.text = "[b]Cross-check:[/b] %d conversation(s) on record.\n\n[i]%s[/i]" % [
		_evidence_entries.size(), _evidence_entries.back()
	]
	phase_hint.text = "Cross-check complete. Review trust and breakdown before locking your accusation."


func _on_clear_case_pressed() -> void:
	suspect_choice.select(0)
	weapon_choice.select(0)
	location_choice.select(0)
	accusation_note_text.text = "Theory reset. Rebuild the case from your interrogation logs."
	_update_case_summary()


func _on_submit_accusation_pressed() -> void:
	if not _case_complete():
		accusation_note_text.text = "Theory incomplete. You still need a suspect, weapon, and location."
		_update_case_summary()
		return

	var suspect_idx := suspect_choice.selected
	var weapon_idx := weapon_choice.selected
	var location_idx := location_choice.selected

	var suspect_npc_id: String = SUSPECT_NPC_IDS[suspect_idx] if suspect_idx < SUSPECT_NPC_IDS.size() else ""
	var weapon_str: String = WEAPON_IDS[weapon_idx] if weapon_idx < WEAPON_IDS.size() else ""
	var room_str: String = LOCATION_IDS[location_idx] if location_idx < LOCATION_IDS.size() else ""

	accusation_note_text.text = "Submitting accusation..."
	submit_accusation_button.disabled = true

	GameSessionManager.submit_accusation(suspect_npc_id, weapon_str, room_str)


func _on_accusation_result(correct: bool, reveal: Dictionary) -> void:
	submit_accusation_button.disabled = false
	var murderer := str(reveal.get("murderer", "unknown"))
	var weapon := str(reveal.get("weapon", "unknown"))
	var room := str(reveal.get("room", "unknown"))
	var victim := str(reveal.get("victim", "Lady Blackwell"))

	if correct:
		accusation_note_text.text = "CASE SOLVED. %s killed %s with the %s in the %s. Well done, Detective." % [murderer.capitalize(), victim, weapon, room]
		phase_summary.text = "Case closed."
	else:
		accusation_note_text.text = "Wrong accusation. The truth: %s killed %s with the %s in the %s. NPC trust reduced." % [murderer.capitalize(), victim, weapon, room]
	_update_case_summary()


func _on_case_selection_changed(_index: int) -> void:
	_update_case_summary()


func _update_case_summary() -> void:
	if not _case_complete():
		case_summary.text = "Theory incomplete: select a suspect, weapon, and location."
		return

	case_summary.text = "Current theory: %s with the %s in the %s." % [
		suspect_choice.get_item_text(suspect_choice.selected),
		weapon_choice.get_item_text(weapon_choice.selected),
		location_choice.get_item_text(location_choice.selected),
	]


func _case_complete() -> bool:
	return suspect_choice.selected > 0 and weapon_choice.selected > 0 and location_choice.selected > 0
