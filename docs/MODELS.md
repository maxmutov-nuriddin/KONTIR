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

## Blender pipeline (`tools/blender/`)

The shipped weapon and prop GLBs are generated, not hand-exported. Requires Blender 4.2+ on `PATH` (`brew install --cask blender`).

```sh
npx vite                                   # dev server on :5190 (export-rigs.mjs builds rigs inside a real page)
node tools/blender/export-rigs.mjs         # game's procedural weapon rigs -> tools/blender/rigs/<id>.glb
tools/blender/build.sh weapons_bake [id …] # PBR materials (edge wear, cavity dirt, scratches, wood grain) baked to
                                           # albedo / ORM / normal maps -> client/public/models/weapons/<id>.glb
tools/blender/build.sh props [key …]       # crate, barrels, container, pillar, well -> client/public/models/props/
tools/blender/compress.sh client/public/models/{weapons,props}/*.glb   # 1024 px WebP textures + meshopt (~4x smaller)
```

* Weapons keep the procedural rigs' exact geometry and frame, so the built-in hand poses still fit; `mag` / `bolt` /
  `slide` / `pump` / `cylinder` stay separate nodes for the reload / fire animations.
* Baked materials are named `<id>_receiver`, `<id>_furniture`, `<id>_metal` (and `<id>_<part>_…`): the first two take
  inventory skins, bare metal does not.
* A prop material whose name contains `tint` is baked near-white and coloured per instance by the game (containers).
* `KONTIR_FAST=1 tools/blender/build.sh …` bakes at quarter resolution for quick previews. Baking uses the GPU
  (Metal / OptiX / CUDA) when Cycles finds one; a full weapon run takes about two hours on an M2.
* Never run `gltf-transform optimize` on these files: it flattens the hierarchy and deletes the part nodes.

### Characters (`tools/blender/character.py`)

Realistic operators built with MPFB (MakeHuman for Blender; generated humans are CC0) and CMU motion capture.

```sh
# one-off setup: MPFB extension + MakeHuman system assets (CC0)
blender -c extension install-file -r user_default -e add-on-mpfb-v2.0.17.zip      # from extensions.blender.org
unzip makehuman_system_assets_cc0.zip -d "$(blender -b --python-expr 'from bl_ext.user_default.mpfb.services import LocationService as L; print(L.get_user_data())' | tail -1)"
# build
tools/blender/build.sh character ct --export
tools/blender/build.sh character t --export
tools/blender/compress.sh client/public/models/characters/*.glb
```

* Body: male, muscular, `cmu_mb` rig (bone names match the game's regexes: `RightHand`, `Spine1`, `Head`).
* Uniform = MakeHuman shirt/trousers re-painted with a procedural camo (`tools/blender/camo.py`: Multicam for CT, Arid
  for T; the garment's own folds / seams are kept). Tactical vest and combat boots are MakeHuman community assets
  (`tools/blender/fetch-assets.sh`, not committed), re-coloured the same way. Gloves, knee pads, leg straps and the
  drop-leg holster are built on the body / trousers so they fit and deform with them. CT: high-cut helmet (rails, NVG
  shroud), headset with boom mic, shooting glasses; T: balaclava. Skin under the clothes is pulled inwards (no holes).
* Clip `lowready` (lobby showcase, `setHoldPose(actor, 'low')`): same hands-on-weapon grip as the gameplay hold, weapon
  pitched down and across the body.
* Credits: *Tactical Vest male* by **Mindfront** — CC-BY (Creative Commons Attribution), makehumancommunity.org/clothes/tactical_vest_male.html;
  *Combat Boots* (CC0) and *Hand Gloves* (CC0) — makehumancommunity.org.
* Clips (`idle`, `walk`, `run`, `squat`, `sneak`, `jump`, `death`) are CMU takes from `tools/blender/bvh/`
  (cgspeed BVH release; CMU places no restrictions on use), retargeted in world space by `tools/blender/anim.py`.
  The arms are held on a rifle by IK and stay level when the actor leans; loops are cut to one gait period.
* `weapon_socket` sits on the right hand; `tools/blender/socketcheck.js` measures where a held weapon points in
  three.js (run through the Vite dev server) — the muzzle must come out as +Z, up as +Y.
