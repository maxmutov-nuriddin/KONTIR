/** Release an owned scene subtree, preserving explicitly shared materials/textures. */
export function disposeTree(root, onMaterial = () => {}) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => {
    if (o.geometry && !o.isSprite && !o.geometry.userData.shared) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) if (!m.userData.shared) materials.add(m);
  });
  for (const g of geometries) { g.disposeBoundsTree?.(); g.dispose(); }
  for (const m of materials) {
    for (const t of Object.values(m)) if (t?.isTexture && !t.userData.shared) textures.add(t);
    onMaterial(m); m.dispose();
  }
  for (const t of textures) t.dispose();
  root.removeFromParent();
}
