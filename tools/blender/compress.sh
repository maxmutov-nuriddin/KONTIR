#!/bin/sh
# Shrinks baked models for the web: textures capped at 1024 px and re-encoded as WebP, geometry meshopt-compressed.
# Node names (mag, bolt, slide, muzzle, ...) are kept — do NOT use `gltf-transform optimize`, it flattens them away.
# Usage: tools/blender/compress.sh client/public/models/weapons/*.glb
set -e
for f in "$@"; do
  t=$(mktemp -d)
  npx -y @gltf-transform/cli@4 resize "$f" "$t/a.glb" --width ${SIZE:-1024} --height ${SIZE:-1024} >/dev/null
  npx -y @gltf-transform/cli@4 webp "$t/a.glb" "$t/b.glb" --quality 85 >/dev/null
  npx -y @gltf-transform/cli@4 meshopt "$t/b.glb" "$t/c.glb" >/dev/null
  before=$(wc -c < "$f"); mv "$t/c.glb" "$f"; rm -rf "$t"
  echo "$(basename "$f"): $((before / 1024)) KB -> $(( $(wc -c < "$f") / 1024 )) KB"
done
