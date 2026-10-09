import { decodePath } from "./navigation.js";

export function routeFromUrl(value) {
  const url = value instanceof URL ? value : new URL(value, "http://localhost");
  const shareMatch = /^\/share\/(.+)$/.exec(url.pathname);
  if (shareMatch) {
    const id = decodePath(shareMatch[1]);
    const token = url.searchParams.get("token") || "";
    return { page: "share", articleId: id, token, isShare: true, invalid: id === null };
  }
  const articleMatch = /^\/articles\/(.+)$/.exec(url.pathname);
  const folderMatch = /^\/directory\/(.+)$/.exec(url.pathname);
  const legacyArticle = url.searchParams.get("article");
  if (articleMatch || legacyArticle) {
    const id = articleMatch ? decodePath(articleMatch[1]) : legacyArticle;
    return { page: "articles", articleId: id, invalid: id === null };
  }
  if (folderMatch) {
    const folder = decodePath(folderMatch[1]);
    return { page: "directory", folder, invalid: folder === null };
  }
  const page = ({ "/": "home", "/articles": "articles", "/directory": "directory", "/categories": "directory", "/tools": "tools", "/about": "about" })[url.pathname];
  const collection = url.searchParams.get("category") ? { type: "category", value: url.searchParams.get("category") } : url.searchParams.get("tag") ? { type: "tag", value: url.searchParams.get("tag") } : null;
  const number = Number(url.searchParams.get("page") || "1");
  return { page: page || "not-found", collection, pageNumber: Number.isSafeInteger(number) && number > 0 ? number : 1 };
}
