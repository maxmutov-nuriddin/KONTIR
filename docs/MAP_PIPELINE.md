# Katta xaritalar: Blender, chunk streaming va xotira

## 1. Xarita dizayni

Hozirgi ikki xarita `shared/maps.js`da, 160 × 160 m. Sahara — qumtoshli uch yo‘nalish, ikki plant maydoni, ochiq cross-connection va platformalar. Harbor — industrial materiallar va konteynerli cover. Ular boshlang‘ich layoutlar; production’da Harbor topology’sini alohida playtest asosida yanada farqlang.

300–500 m sahna geometriyasining o‘zi yaxshi taktik xarita yaratmaydi. Asosiy metrikalar: spawn→first contact vaqti, rotate vaqti, sightline uzunligi, choker kengligi, cover oralig‘i, plant/defuse ko‘rinishlari va ikki tomon timing muvozanati.

Talab: kamida uchta yo‘nalish, ikkita maqsad hududi, spawn-safe sightline, 1–2 vertikal pozitsiya, alternativ rotation. Spawnlar devor/collider ichida bo‘lmasin. Navmesh va checkpoint/plant hajmlari vizual mesh’dan alohida tekshirilsin.

## 2. Blender birlik va eksport shartnomasi

- Metr masshtabi. GLTF runtime’da Y-up. Kamera oldi -Z.
- `Ctrl+A → Rotation & Scale`; negative scale/normal muammolarini tekshiring.
- Kolleksiyalar: `VISUAL`, `COLLISION`, `NAVIGATION`, `PORTALS`, `SPAWNS`, `OBJECTIVES`.
- Building visual assetlar low/mid-poly, collision alohida soddalashtirilgan shakl.
- Teksturali devor modulini takrorlang; trim sheet/atlas bilan material slotlarini kamaytiring.
- Normal/roughness/AO bake. GLTF eksport qilmaydigan procedural shaderlarni teksturaga bake qiling.
- Principled PBR oqimi; albedo/emissive sRGB, normal/roughness kabi data teksturalari linear.
- Darvoza va oynalar kabi ko‘rish chizig‘iga ta’sir qiluvchi obyektlar collision/visibility metadata bilan bir xil versionda eksport qilinsin.

Qurol: 8–20 ming triangle viewmodel LOD0 boshlang‘ich budjet; world model 1–4 ming. Pivot: muzzle, grip, magazine, bolt. Operator uchun rig/animatsiya nomlari standart: idle, walk, run, crouch, jump, fire, reload. Server hitbox pose’i animatsiyaning ko‘rinishigagina ishonmasin.

## 3. Chunk manifest

`32 × 32 m` chunk bilan boshlang; katta landmarkni bir chunkka yoki shared assetga tegishli qiling. Meta misoli:

```json
{
  "mapId": "sahara-v1",
  "versionHash": "content-hash",
  "units": "meters",
  "chunkSize": 32,
  "collisionUrl": "/maps/sahara/collision.hash.bin",
  "navigationUrl": "/maps/sahara/navmesh.hash.bin",
  "chunks": [
    {
      "id": "0_1",
      "url": "/maps/sahara/0_1.hash.glb",
      "bounds": [-16, 0, 16, 16, 14, 48],
      "gpuBytes": 12582912,
      "compressedBytes": 650000,
      "pvs": ["0_0", "0_2", "1_1"],
      "lods": ["/maps/sahara/0_1_lod1.hash.glb"]
    }
  ]
}
```

GLB download size VRAM sarfi emas. Oddiy RGBA8 2048² tekstura ≈16 MiB, mipmaplar bilan ≈21.3 MiB; bir nechta map tezda yuzlab MiBga yetadi. KTX2/Basis va kerakli platforma formatlarini qo‘llang. Geometry decode, ImageBitmap va GPU texture vaqtincha bir vaqtda xotirada bo‘lishini ham hisobga oling.

## 4. Yuklash strategiyasi

Hozir `ChunkWorld` collider metadata’dan vizual instanced boxlarni yaratadi. Chunk markazlari bo‘yicha yaqin hudud load, uzoq hudud dispose qilinadi; hysteresis qayta-qayta load/unload bo‘lishini kamaytiradi. Klientda collision metadata to‘liq resident: mesh yuklanmagan joydan o‘tib ketish bo‘lmaydi.

Production visual streaming:

1. Match join paytida manifest/config hash tekshiriladi.
2. Butun collision va nav/visibility metadata oldindan keladi yoki xavfsiz server cheklovi bilan stream qilinadi.
3. Spawn chunk va ko‘rinadigan qo‘shnilar yuqori priority bilan yuklanadi.
4. Player velocity/look direction asosida oldindan prefetch qilinadi.
5. Harakatdagi yo‘nalish 1–2 soniya oldinga hisoblanadi; keskin burilish uchun safety ring qoladi.
6. 2 concurrent fetch/decode bilan boshlang; Worker’da decode, main threadda bounded upload.
7. GLB parse tugagach request hali relevant ekanini generation token/entry identity bilan tekshiring.
8. Uzoq chunklar LRU va hysteresis asosida chiqariladi. Shared texture/geometry uchun reference count kerak.

`client/src/world/glb-streamer.js` abort, stale result cleanup, 2 ta concurrent load va 128 MiB estimated GPU budget namunasi. Adapter demo sahnaga ulanmagan. U GLB ichidagi resurslar chunkka tegishli deb faraz qiladi. Shared cache kiritsa ref-count, pinned resident chunks, priority queue, eviction/retry policy va worker decode qo‘shish zarur. Parse tugagach budjetga sig‘masa asset dispose qilinadi; buning ustiga LRU eviction rejalashtiriladi.

## 5. Frustum va occlusion farqi

Frustum culling kameraning piramidal ko‘rish hajmidan tashqaridagi obyektlarni chizmaydi. Devor ortidagi, lekin frustum ichidagi obyektni yashirmaydi. Demo `THREE.Frustum.intersectsBox` ishlatadi. [Three.js hujjati](https://threejs.org/docs/pages/Frustum.html)

Taktik koridor/interyer xaritalari uchun production reja:

- Har xona/ko‘cha bo‘limini cell sifatida belgilang.
- Eshik/yo‘laklar portal; cell graph va offline conservative PVS eksport qilinadi.
- Kameraning current cell’idan portal traversal qiling.
- Avval PVS kandidatlarini, keyin frustum testini qo‘llang.
- Dynamic eshik portal holatini yangilaydi; bekor yopish popping yoki yo‘qolgan dushmanga olib kelmasin.
- Katta ochiq sahnalarda LOD/HLOD va distance culling; qurol uchun muhim dushman/cover detallarini aggressive cull qilmang.
- GPU occlusion query kerak bo‘lsa natijani kechiktirib o‘qing, CPU/GPU sync stall yaratmang. WebGPU HZB occlusion alohida bosqich.

Server-side interest management vizual cullingdan mustaqil. Klientda mesh’ni yashirish network’dan olingan yashirin opponent holatini himoyalamaydi.

## 6. Boshlang‘ich performance budjeti

Quyidagilar profiling uchun target, universal kafolat emas:

| Resurs | Desktop boshlang‘ich budjet |
|---|---:|
| Visible triangles | 300–700 ming |
| Draw calls | 150–300 |
| Shadow-casting light | 1 |
| Dynamic shadow atlas | 1024/2048 |
| Visual chunk GPU residency | 128–256 MiB |
| Far LOD texture | 512–1024 |
| Near primary texture | 1024–2048 |
| Concurrent GLB decode | 1–2 |
| Snapshot rate | ~21 Hz, renderdan mustaqil |

DPR’ni mobil/zaif GPU’da 1 bilan cheklang. Repeated props uchun `InstancedMesh`, statik meshlarni faqat bir visibility chunk ichida birlashtirish, shader variantlarni kamaytirish va texture atlas ishlating. Butun xaritani bitta mesh qilib qo‘yish cullingni yomonlashtiradi.

Soyani faqat player atrofidagi cheklangan camera hajmida chizing; static light/AO bake qiling. Bloom half resolution; motion blur competitive’da o‘chiq. UI’ni 10 Hz yangilash yetarli; layoutni har kadrda o‘lchamang.

## 7. Import acceptance checklist

- GLB scale/pivot/material va normal’lar tekshirilgan.
- Collision visual devor va zinapoyaga mos.
- Camera / bullet LOS / navmesh bir-biriga mos.
- Spawn va objective volume collider ichida emas.
- Har ikki spawn’dan A/Bga nav yo‘li mavjud.
- Chunk boundary’da texture/mesh seam yoki teshik yo‘q.
- Tez burilish/respawn’da missing chunk collisionga ta’sir qilmaydi.
- 10 daqiqa xarita bo‘ylab yurishdan keyin VRAM/heap cheksiz o‘smaydi.
- 30/60/144 render profile, yuqori DPR va past sifat rejimi tekshirilgan.
- Haqiqiy maqsadli qurilmada p95 frame time o‘lchangan; faqat rivojlantiruvchi kompyuteridagi o‘rtacha FPS yetarli emas.
