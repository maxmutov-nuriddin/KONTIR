# Real 3D models (weapons, characters, props)

Every model is **optional**. Drop a `.glb` into `client/public/models/…` and it replaces the procedural version the
next time you run `npm run dev` / `npm start` / `npm run build` (they run `tools/scan-models.mjs`, which writes
`models.json`; maps are rebuilt automatically when props change). Remove the file to go back to the procedural model.

```
client/public/models/
  weapons/<id>.glb        ak47, m4a4, m4a1s, awp, deagle, usp, glock, … (ids from shared/weapons.js)
  characters/t.glb        Terrorist operator (skinned)
  characters/ct.glb       Counter-Terrorist operator (skinned)
  props/<key>.glb         crate, crate_stack, barrels, car, well, palm, container, pillar
```

## Weapons

* Units: metres. Muzzle toward **−Z**, up **+Y**, origin at the pistol grip (where the right palm sits).
* Optional named nodes (the reload / fire / inspect animations use them automatically):
  `mag`, `bolt`, `slide`, `pump`, `cylinder` (moving parts), `muzzle`, `eject` (empties),
  `hand_right`, `hand_left` (empties: palm position + rotation; otherwise the built-in hand pose for that weapon class is used).
* Materials whose name contains `paint`, `body`, `receiver`, `frame`, `stock`, `furniture` or `skin` take the
  INVENTORY skins; metal / glass / rubber keep their own look.

## Characters

* A rigged humanoid (Mixamo rig works as-is), facing **+Z**, any size (auto-scaled to 1.8 m).
* Animation clips found by name (case-insensitive, partial): `idle`, `walk`, `run`, `crouch` (idle), `crouch_walk`,
  `jump`, `death`. Missing clips fall back sensibly (e.g. run → walk).
* The weapon attaches to the right-hand bone (`mixamorigRightHand` etc.), or to a node named `weapon_socket`.
* Aim pitch bends the spine bone on top of the clip.

## Props (map dressing)

* Origin on the floor, length along **+X**. Nominal sizes the collision is built for:
  crate 1.5 m cube · crate_stack 3 × 3 × 1.5 · barrels 1.9 × 1.8 · car 4.2 × 1.8 · well Ø2 · palm trunk Ø0.45 ·
  container 6 × 2.6 × 2.5 · pillar 0.9 × 4.2.
* Each prop type becomes one `InstancedMesh` per material, so dozens of copies cost a few draw calls; collision uses
  invisible clip boxes baked into the map.

## Where to get models (check each licence)

| Source | Good for | Licence |
|---|---|---|
| [Poly Haven](https://polyhaven.com) | props, HDRI skies, textures | CC0 |
| [ambientCG](https://ambientcg.com) | PBR textures (plaster, stone, metal) | CC0 |
| [Quaternius](https://quaternius.com), [Kenney](https://kenney.nl) | stylised props, modular buildings, guns | CC0 |
| [Sketchfab](https://sketchfab.com) (filter: downloadable, CC0 / CC-BY) | realistic weapons, cars, props | CC0 / CC-BY (credit the author) |
| [Mixamo](https://www.mixamo.com) | rigged soldiers + all animations | free with an Adobe account |

Valve / CS2 assets must **not** be used.

## Keep downloads small

```sh
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 2048
```

The game's loader already supports meshopt and Draco. Large binaries are best stored with Git LFS
(`git lfs track "client/public/models/**/*.glb"`).
