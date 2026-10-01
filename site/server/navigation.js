export function articleIdentity(fileId, data) {
  const siyuanId = String(data.siyuanId || "").trim();
  return data.source === "siyuan" && /^[\w-]+$/.test(siyuanId)
    ? `siyuan/${siyuanId}`
    : fileId;
}

// SiYuan exports a title and invisible placeholder even for an empty document.
// Keep images, code and other headings as content; only remove the document title.
export function hasArticleBody(content, title) {
  const lines = String(content || "").replace(/[\u200B-\u200D\uFEFF]/g, "").split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => {
    const heading = /^#\s+(.+?)\s*#*\s*$/.exec(line.trim());
    return heading && heading[1].trim() === title.trim();
  });
  if (titleIndex >= 0) lines.splice(titleIndex, 1);
  return lines.join("\n").trim().length > 0;
}

export function buildNavigation(documents) {
  const folderPaths = new Set();
  for (const document of documents) {
    const parts = document.path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      folderPaths.add(parts.slice(0, i).join("/"));
    }
    if (document.navigation === "folder") folderPaths.add(document.path);
  }

  const classified = documents.map((document) => ({
    ...document,
    isDirectory: document.navigation === "folder" ||
      (folderPaths.has(document.path) && !document.hasBody && document.navigation !== "article"),
    isOverview: folderPaths.has(document.path)
  }));
  const root = { type: "root", name: "知识库", children: [] };
  const folders = new Map([["", root]]);
  const ensureFolder = (folderPath) => {
    if (folders.has(folderPath)) return folders.get(folderPath);
    const parts = folderPath.split("/");
    const parent = ensureFolder(parts.slice(0, -1).join("/"));
    const node = { type: "folder", path: folderPath, name: parts.at(-1), children: [], articleCount: 0 };
    parent.children.push(node);
    folders.set(folderPath, node);
    return node;
  };
  for (const folderPath of folderPaths) ensureFolder(folderPath);

  for (const document of classified) {
    if (document.isDirectory) continue;
    const node = {
      type: "article", id: document.id, title: document.title,
      summary: document.summary, category: document.category, order: document.order
    };
    if (folderPaths.has(document.path)) {
      const folder = ensureFolder(document.path);
      folder.overview = node;
      folder.order = document.order;
    } else {
      const parentPath = document.path.split("/").slice(0, -1).join("/");
      ensureFolder(parentPath).children.push(node);
    }
  }

  const finish = (node) => {
    if (node.type === "article") return 1;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      if ((a.order ?? 9999) !== (b.order ?? 9999)) return (a.order ?? 9999) - (b.order ?? 9999);
      return (a.title || a.name).localeCompare(b.title || b.name, "zh-CN");
    });
    node.articleCount = (node.overview ? 1 : 0) + node.children.reduce((count, child) => count + finish(child), 0);
    return node.articleCount;
  };
  finish(root);
  return { documents: classified, articles: classified.filter((document) => !document.isDirectory), tree: root };
}
