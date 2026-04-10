extends Control

const CORRECT_CASE := {
	"suspect": 2,
	"weapon": 1,
	"location": 2,
}

const THEORY_DEFAULT := "[i]The killer knew the manor layout and moved during blackout. The crash in the atrium and the missing candlestick feel connected.[/i]\n\n[b]Current read:[/b] Someone is staging panic to hide a planned route between the kitchen corridor and the conservatory."
const THEORY_PIN_GLASS := "[i]Pinned clue:[/i] The shattered glass ties noise, movement, and wet footprints together.\n\n[b]Lead:[/b] Ren's denial is now the weakest alibi in the house. Cross-check anyone who claims they stayed east of the atrium."
const THEORY_PIN_WEAPON := "[i]Pinned clue:[/i] The missing candlestick implies intent, not panic.\n\n[b]Lead:[/b] Whoever lifted it likely knew blackout timing in advance and chose a route with low witness traffic."
const THEORY_PIN_TESTIMONY := "[i]Pinned clue:[/i] Daichi's changing testimony suggests he is hiding a timeline gap.\n\n[b]Lead:[/b] The contradiction may be fear rather than guilt, but it still narrows who saw the killer move."
const THEORY_CROSS_CHECK := "[i]Cross-check complete:[/i] Ren and Daichi now carry the most pressure in the timeline.\n\n[b]Lead:[/b] The strongest version of the case is a planned movement through the kitchen passage during blackout using the missing candlestick."

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


func _ready() -> void:
	pin_clue_button.pressed.connect(_on_pin_clue_pressed)
	cross_check_button.pressed.connect(_on_cross_check_pressed)
	clear_case_button.pressed.connect(_on_clear_case_pressed)
	submit_accusation_button.pressed.connect(_on_submit_accusation_pressed)
	suspect_choice.item_selected.connect(_on_case_selection_changed)
	weapon_choice.item_selected.connect(_on_case_selection_changed)
	location_choice.item_selected.connect(_on_case_selection_changed)
	_apply_default_state()


func _apply_default_state() -> void:
	theory_text.text = THEORY_DEFAULT
	phase_summary.text = "34 seconds until blackout"
	phase_hint.text = "Listen for disturbances, pressure suspects, and log any change in trust before the lights fail."
	evidence_action_text.text = "Pinned clue: none"
	accusation_note_text.text = "A false accusation should damage trust. Leave the case open until your timeline and object trail line up."
	_update_case_summary()


func _on_pin_clue_pressed() -> void:
	pinned_clue_index = (pinned_clue_index + 1) % 3

	match pinned_clue_index:
		0:
			evidence_action_text.text = "Pinned clue: Glass shattered near the central fountain"
			theory_text.text = THEORY_PIN_GLASS
		1:
			evidence_action_text.text = "Pinned clue: Candlestick missing from display shelf"
			theory_text.text = THEORY_PIN_WEAPON
		2:
			evidence_action_text.text = "Pinned clue: Daichi contradicts his first timeline"
			theory_text.text = THEORY_PIN_TESTIMONY


func _on_cross_check_pressed() -> void:
	theory_text.text = THEORY_CROSS_CHECK
	phase_summary.text = "Alibis cross-checked"
	phase_hint.text = "Ren and Daichi now need direct follow-up before you lock the accusation."
	trust_list.text = "Aiko: Trust [color=#355b52]68[/color]  |  Breakdown [color=#8a4f3b]24[/color]\nRen: Trust [color=#355b52]33[/color]  |  Breakdown [color=#8a4f3b]71[/color]\nMina: Trust [color=#355b52]57[/color]  |  Breakdown [color=#8a4f3b]45[/color]\nDaichi: Trust [color=#355b52]25[/color]  |  Breakdown [color=#8a4f3b]81[/color]"
	accusation_note_text.text = "Cross-checking tightened the timeline. The cleanest accusation now points through the kitchen passage and the missing candlestick."


func _on_clear_case_pressed() -> void:
	suspect_choice.select(0)
	weapon_choice.select(0)
	location_choice.select(0)
	accusation_note_text.text = "Theory reset. Rebuild the case from the strongest clue chain before accusing anyone."
	_update_case_summary()


func _on_submit_accusation_pressed() -> void:
	if not _case_complete():
		accusation_note_text.text = "Theory incomplete. You still need a suspect, weapon, and location before the journal can lock an accusation."
		_update_case_summary()
		return

	var is_correct := suspect_choice.selected == CORRECT_CASE.suspect \
		and weapon_choice.selected == CORRECT_CASE.weapon \
		and location_choice.selected == CORRECT_CASE.location

	if is_correct:
		accusation_note_text.text = "Accusation aligned. Ren, the candlestick, and the kitchen passage match the strongest evidence thread in this prototype case."
	else:
		accusation_note_text.text = "Accusation logged, but the evidence trail feels weak. A wrong call here would damage trust across the remaining NPCs."

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
