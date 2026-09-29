# Xarita pipeline (GLB → BVH → render)

```
tools/maps/*.mjs ──build──▶ client/public/maps/<id>.glb + manifest.json
                                   │
              ┌────────────────────┴────────────────────┐
   server: shared/glb.js parseGLB           client: fetch → parseGLB (fizika)  +  GLTFLoader (vizual)
   → MeshCollider (three-mesh-bvh)          → BVH kapsula prediksiyasi          → PBR, CSM, chunk batching
   → Navigation (botlar), spawnlar, saytlar
```

## GLB shartnomasi
| Element | Qoida |
|---|---|
| `spawn_T_1..5`, `spawn_CT_1..5` | Bo‘sh node; joylashuvi = spawn, Y‑aylanish = qarash yo‘nalishi (yaw 0 = −Z) |
| `site_A`, `site_B` | Bo‘sh node; `scale.x` = plant radiusi (m) |
| mesh `decor_*` / `nocollide_*` / `skybox*` | Faqat ko‘rinish |
| mesh `clip_*` | Faqat to‘qnashuv (render qilinmaydi) |
| material nomi | PBR retseptini tanlaydi: `plaster`, `brick`, `concrete`, `stone`, `wood`, `crate`, `container_*`, `metal`, `rust`, `asphalt`, `cloth`, `glass`, `sand`. O‘z teksturalaringiz (map/normalMap) bo‘lsa ular ishlatiladi |
| birlik | metr, Y yuqoriga; oyoq yuzasi = 0 atrofida |
| siqilish | Draco/meshopt faqat vizual GLB’da; fizika uchun siqilmagan `<id>.collision.glb` |

`npm run maps` `client/public/maps` ni skanerlaydi: har bir `.glb` (marker’lari to‘liq bo‘lsa) `manifest.json` ga qo‘shiladi va menyuda ko‘rinadi.

## Fizika
`MeshCollider`: barcha to‘qnashuvchi uchburchaklar bitta `MeshBVH`. Kapsula (r = 0.35, 1.8 → 1.2 m) `shapecast` bilan itariladi; qadamdan chiqish (`stepHeight` 18 u) BVH nurlari bilan pog‘ona balandligini topib amalga oshiriladi; nishablik `walkableNormalY = 0.7`. Server va klient **bir xil baytlardan** qurgani uchun natijalar mos.

## Render
1. Material bo‘yicha guruhlash → 28 m‑li katakchalarga bo‘lish (umumiy vertex buferlar, alohida index) → frustum culling; draw call ≈ material × ko‘rinadigan chunk.
2. Har chunk geometriyasiga `computeBoundsTree()` (Mesh.raycast BVH tezlashgan).
3. Material: GLB rangi/faktorlari saqlanadi, retseptdan `map/normalMap/roughness+metalness` qo‘shiladi, CSM va makro‑variatsiya shader patchi.
4. Radar rasmi to‘qnashuv BVH’dan yuqoridan nur otish bilan yaratiladi (har qanday GLB uchun ishlaydi).

## Byudjet (o‘lchangan)
Sahara: ≈ 4 100 to‘qnashuv uchburchagi, BVH ≈ 60 ms; navigatsiya grid ≈ 90 ms (server, xarita boshiga bir marta).
