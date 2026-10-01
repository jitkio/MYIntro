export const articlePath = (id) => `/articles/${encodePath(id)}`;
export const folderPath = (path) => `/directory/${encodePath(path)}`;
export const encodePath = (value) => String(value).split("/").map(encodeURIComponent).join("/");

export function decodePath(value) {
  try {
    // Decode segments independently so escaped separators cannot change hierarchy.
    const segments = String(value).split("/").map(decodeURIComponent);
    if (segments.some((segment) => segment.includes("/"))) return null;
    return segments.join("/");
  } catch { return null; }
}

export function findFolder(tree, path) {
  if (!tree) return null;
  if (tree.type === "folder" && tree.path === path) return tree;
  for (const child of tree.children || []) {
    if (child.type === "article") continue;
    const found = findFolder(child, path);
    if (found) return found;
  }
  return null;
}

export function folderAncestors(tree, path) {
  const parts = String(path || "").split("/");
  return parts.map((_, index) => findFolder(tree, parts.slice(0, index + 1).join("/"))).filter(Boolean);
}

export function articleFolder(tree, id) {
  if (!tree) return null;
  if (tree.overview?.id === id || tree.children?.some((child) => child.type === "article" && child.id === id)) return tree;
  for (const child of tree.children || []) {
    if (child.type === "article") continue;
    const found = articleFolder(child, id);
    if (found) return found;
  }
  return null;
}
