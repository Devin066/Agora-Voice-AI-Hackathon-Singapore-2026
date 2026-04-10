# Painted Asset Pack Into `rooms.tscn`

The current room blockout at [`godot/scenes/rooms.tscn`](C:\Users\Jason\Documents\GitHub\agora-voice-hack\godot\scenes\rooms.tscn) is a `Node2D` scene built from `Polygon2D` shapes. That means Basilika's painted household pack cannot be instanced into it directly as live 3D furniture under the same root.

The asset pack page confirms a few constraints that matter here:

- It is a 3D interior pack aimed at kitchen, living room, and bedroom dressing.
- It is distributed as `handpainted-assets.zip`.
- The license is CC BY 4.0, so the game needs visible attribution when we ship or share builds.

## Recommended path for this repo

For the current vertical slice, the least risky integration path is:

1. Download and unzip the pack under `godot/assets/environment/painted_household/`.
2. Keep the original license text or attribution note alongside the imported files.
3. Use the `Props` layer and `Props/PropAnchors/*` markers in [`godot/scenes/rooms.tscn`](C:\Users\Jason\Documents\GitHub\agora-voice-hack\godot\scenes\rooms.tscn) as placement guides.
4. Start by dressing non-atrium rooms with a few large hero props that fit the pack well: tables, sofas, cabinets, beds, shelves.
5. Keep the atrium mostly readable and only add one or two focal pieces there.

## Two viable integration options

### Option A: 2.5D proxy props

Best for the jam scope.

- Import the pack into Godot as normal.
- Open each model in a small staging `Node3D` scene.
- Render painterly stills or orthographic snapshots from the game angle.
- Use those renders as `Sprite2D` props on the `Props` layer in `rooms.tscn`.

This fits the existing player controller, draw ordering, and collision setup without forcing a full 3D rewrite.

### Option B: Embedded live 3D dressing

Higher effort, only worth it if we want moving camera or dynamic lighting on furniture.

- Keep `rooms.tscn` as the gameplay layout.
- Add a `SubViewport`-driven `Node3D` interior staging scene that matches the room footprint.
- Composite the viewport output back into the 2D scene.

This gives true 3D furniture, but alignment, lighting, and occlusion become a separate system.

## Current prep already added

[`godot/scenes/rooms.tscn`](C:\Users\Jason\Documents\GitHub\agora-voice-hack\godot\scenes\rooms.tscn) now includes:

- `Props` at `z_index = 3`, between floor/shadow shapes and wall trim.
- `Props/PropAnchors/*` markers for each room center and back wall.

Those anchors are the intended drop points for first-pass furniture dressing once the Basilika files are present locally.
