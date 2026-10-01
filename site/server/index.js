import express from "express";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { articleIdentity, buildNavigation, hasArticleBody } from "./navigation.js";
import { findFolder, folderPath } from "../shared/navigation.js";
import { routeFromUrl } from "../shared/routes.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(serverDir, "..");
const defaultProjectRoot = path.resolve(siteDir, "..");

const projectRoot = path.resolve(process.env.KB_PROJECT_ROOT || defaultProjectRoot);
loadDotEnv(path.join(projectRoot, ".env"));
const dataRoot = path.resolve(process.env.KB_DATA_DIR || projectRoot);

const contentDir = path.resolve(process.env.KB_CONTENT_DIR || path.join(projectRoot, "content"));
const articlesDir = path.join(contentDir, "articles");
const mediaDir = path.join(contentDir, "media");
const runtimeDir = path.resolve(process.env.KB_RUNTIME_DIR || path.join(projectRoot, "runtime"));
const indexDir = path.join(runtimeDir, "index");
const publicDir = path.resolve(process.env.KB_PUBLIC_DIR || path.join(siteDir, "public"));
const siyuanWorkspaceDir = path.resolve(
  process.env.KB_SIYUAN_WORKSPACE_DIR || path.join(projectRoot, "siyuan", "workspace")
);
const distDir = path.join(siteDir, "dist");

const host = process.env.KB_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.KB_PORT || "8796", 10);
const isProduction = process.env.NODE_ENV === "production";
const siyuanBaseUrl = (process.env.SIYUAN_BASE_URL || `http://127.0.0.1:${process.env.SIYUAN_PORT || "6806"}`).replace(
  /\/+$/,
  ""
);
const siyuanAccessAuthCode = process.env.SIYUAN_ACCESS_AUTH_CODE || "";
const siyuanApiToken = String(process.env.SIYUAN_API_TOKEN || "");
const siyuanSyncIntervalSeconds = Number.parseInt(process.env.SIYUAN_SYNC_INTERVAL_SECONDS || "60", 10);
const siyuanSyncIncludeNotebooks = splitEnvList(process.env.SIYUAN_SYNC_NOTEBOOKS || "");
const siyuanSyncExcludeNotebooks = splitEnvList(process.env.SIYUAN_SYNC_EXCLUDE_NOTEBOOKS || "SiYuan User Guide");
const siyuanPublicNotebooks = splitEnvList(process.env.SIYUAN_PUBLIC_NOTEBOOKS || "");
const adminToken = String(process.env.KB_ADMIN_TOKEN || "");
const adminSecret = adminToken || siyuanAccessAuthCode;
const adminSessionCookieName = "myblog_admin_session";
const adminSessionTtlSeconds = 12 * 60 * 60;
const adminLoginWindowMs = 15 * 60 * 1000;
const adminLoginMaxAttempts = 8;
const adminLoginAttempts = new Map();
const publicOrigin = String(process.env.KB_PUBLIC_ORIGIN || `http://localhost:${port}`).replace(/\/+$/, "");
const editorUrl = String(process.env.SIYUAN_PUBLIC_URL || "");

function loadDotEnv(filePath) {
  if (!fsSync.existsSync(filePath)) {
    return;
  }

  const text = fsSync.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function splitEnvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertInside(parent, target, label) {
  if (!isInside(parent, target)) {
    throw new Error(`${label} must stay inside ${parent}`);
  }
}

assertInside(dataRoot, contentDir, "KB_CONTENT_DIR");
assertInside(dataRoot, runtimeDir, "KB_RUNTIME_DIR");
assertInside(projectRoot, publicDir, "KB_PUBLIC_DIR");
assertInside(dataRoot, siyuanWorkspaceDir, "KB_SIYUAN_WORKSPACE_DIR");

function normalizeArticleId(value) {
  const id = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = id.split("/");

  if (!id || id.includes("\0") || id.endsWith(".md")) {
    return null;
  }

  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) {
    return null;
  }

  return id;
}

function parseMarkdown(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text);

  if (!match) {
    return { data: {}, content: text };
  }

  let data = {};
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    data = {};
  }

  return {
    data,
    content: text.slice(match[0].length)
  };
}

function articlePathFromId(id) {
  const normalized = normalizeArticleId(id);
  if (!normalized) {
    return null;
  }

  const filePath = path.resolve(articlesDir, `${normalized}.md`);
  return isInside(articlesDir, filePath) ? filePath : null;
}

async function ensureRuntime() {
  await fs.mkdir(indexDir, { recursive: true });
  await fs.mkdir(articlesDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkMarkdownFiles(dir) {
  if (!(await pathExists(dir))) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...(await walkMarkdownFiles(fullPath)));
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !entry.name.startsWith(".")) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function parsePublished(value) {
  if (value === true || value === 1) {
    return true;
  }

  if (value === false || value === 0) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "published"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "draft"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function isPublished(data) {
  return parsePublished(data?.published) === true;
}

function headingId(text, used = new Map()) {
  const base = String(text || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function stripMarkdown(content) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\([^)]*\)/g, " ")
    .replace(/[#>*_`~\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstParagraph(content) {
  return stripMarkdown(content)
    .split(/(?<=[。！？.!?])\s+/)
    .find(Boolean)
    ?.slice(0, 120) || "";
}

function extractHeadings(content) {
  const usedIds = new Map();
  return content
    .split("\n")
    .map((line) => /^(#{1,3})\s+(.+)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      text: match[2].replace(/#+$/, "").trim()
    }))
    .map((heading) => ({
      ...heading,
      id: headingId(heading.text, usedIds)
    }));
}

function extractMediaFiles(content) {
  const files = new Set();
  const markdown = String(content || "").replace(/```[\s\S]*?```/g, "");
  const matches = markdown.matchAll(/!?\[[^\]]*]\((\/media\/[^\s)]+)/g);

  for (const match of matches) {
    const rawUrl = match[1];
    const pathname = rawUrl.split(/[?#]/)[0];
    let decoded = "";
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      continue;
    }

    const target = path.resolve(mediaDir, decoded.replace(/^\/media\//, ""));
    if (isInside(mediaDir, target)) {
      files.add(path.relative(mediaDir, target).replace(/\\/g, "/"));
    }
  }

  return files;
}

function categoryFromId(id, data) {
  if (data.category) {
    return String(data.category);
  }

  const firstFolder = id.split("/")[0];
  const names = {
    intro: "项目",
    hardware: "硬件",
    magent: "Magent",
    adapter: "Adapter",
    api: "接口"
  };

  return names[firstFolder] || firstFolder || "未分类";
}

async function readArticleMeta(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parseMarkdown(raw);
  const relativePath = path.relative(articlesDir, filePath).replace(/\\/g, "/");
  const fileId = relativePath.replace(/\.md$/i, "");
  const id = articleIdentity(fileId, parsed.data);
  const headingTitle = /^#\s+(.+)$/m.exec(parsed.content)?.[1]?.trim();
  const title = String(parsed.data.title || headingTitle || path.basename(filePath, ".md"));
  const category = categoryFromId(fileId, parsed.data);
  const tags = normalizeTags(parsed.data.tags);
  const isSiyuanSource = parsed.data.source === "siyuan";
  const summary = String(parsed.data.summary || (isSiyuanSource ? "" : firstParagraph(parsed.content)));
  const order = Number.parseInt(parsed.data.order || "9999", 10);
  const updatedAt = parsed.data.updated || parsed.data.date || null;

  return {
    id,
    path: fileId,
    fileId,
    hasBody: hasArticleBody(parsed.content, title),
    navigation: parsed.data.navigation || "auto",
    title,
    summary,
    category,
    tags,
    order: Number.isFinite(order) ? order : 9999,
    updatedAt,
    published: isPublished(parsed.data),
    headings: extractHeadings(parsed.content),
    mediaFiles: extractMediaFiles(parsed.content),
    searchText: [title, summary, category, ...tags, stripMarkdown(parsed.content)].join(" ").toLowerCase()
  };
}

function sortArticles(articles) {
  return [...articles].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.title.localeCompare(b.title, "zh-CN");
  });
}

function buildCategories(articles) {
  const map = new Map();

  for (const article of articles) {
    if (!map.has(article.category)) {
      map.set(article.category, []);
    }
    map.get(article.category).push(article);
  }

  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      articles: sortArticles(items).map(publicArticle)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

let indexCache = null;

async function buildIndex() {
  await ensureRuntime();

  const files = await walkMarkdownFiles(articlesDir);
  const publishedDocuments = sortArticles((await Promise.all(files.map(readArticleMeta))).filter((article) => article.published));
  const { articles, documents, tree } = buildNavigation(publishedDocuments);
  const mediaFiles = new Set(documents.flatMap((article) => [...article.mediaFiles]));
  const aliasFile = path.join(indexDir, "article-aliases.json");
  const savedAliases = await readJsonFile(aliasFile, {});
  const aliases = new Map(Object.entries(savedAliases || {}));
  for (const document of documents) {
    if (document.id !== document.path) aliases.set(document.path, document.id);
  }
  await fs.writeFile(aliasFile, JSON.stringify(Object.fromEntries(aliases), null, 2), "utf8");
  const generatedAt = new Date().toISOString();
  const index = {
    generatedAt,
    articles,
    documents,
    aliases,
    mediaFiles,
    tree,
    categories: buildCategories(articles)
  };

  const diskIndex = {
    generatedAt,
    articles: articles.map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      category: article.category,
      tags: article.tags,
      updatedAt: article.updatedAt,
      searchText: article.searchText
    }))
  };

  await fs.writeFile(path.join(indexDir, "search-index.json"), JSON.stringify(diskIndex, null, 2), "utf8");
  indexCache = index;
  return index;
}

async function getIndex({ force = false } = {}) {
  if (!indexCache || force) {
    return buildIndex();
  }

  return indexCache;
}

const syncManifestPath = path.join(indexDir, "siyuan-sync-manifest.json");
const syncStatusPath = path.join(indexDir, "siyuan-sync-status.json");
const siyuanMediaDir = path.join(mediaDir, "siyuan");
let siyuanSyncPromise = null;

function safeSegment(value, fallback = "untitled") {
  const segment = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  if (!segment || segment === "." || segment === ".." || segment.startsWith(".")) {
    return fallback;
  }

  return segment;
}

function safeDecodeUrl(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^(?:data|mailto|tel):/i.test(value);
}

function encodeMediaUrl(fileName) {
  return `/media/siyuan/${encodeURIComponent(fileName).replace(/%2F/gi, "/")}`;
}

function frontmatterWith(raw, fields) {
  const parsed = parseMarkdown(raw);
  const data = {
    ...parsed.data,
    ...fields
  };
  const yaml = stringifyYaml(data).trim();
  return `---\n${yaml}\n---\n\n${parsed.content.replace(/^\s+/, "")}`;
}

function formatSiyuanTime(seconds) {
  const timestamp = Number(seconds);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return new Date().toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readSyncStatus() {
  return readJsonFile(syncStatusPath, {
    state: "never-run",
    lastAttemptAt: null,
    lastSuccessAt: null
  });
}

async function writeSyncStatus(next) {
  const previous = await readSyncStatus();
  const status = {
    ...previous,
    ...next
  };
  await fs.writeFile(syncStatusPath, JSON.stringify(status, null, 2), "utf8");
  return status;
}

function publicSyncStatus(status) {
  return {
    state: status.state || "never-run",
    lastAttemptAt: status.lastAttemptAt || null,
    lastSuccessAt: status.lastSuccessAt || null,
    generatedAt: status.generatedAt || null,
    notebooks: Number.isFinite(status.notebooks) ? status.notebooks : 0,
    articles: Number.isFinite(status.articles) ? status.articles : 0,
    deleted: Number.isFinite(status.deleted) ? status.deleted : 0
  };
}

function syncErrorMessage(error) {
  return String(error?.message || "Unknown sync error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

async function removeEmptyDirsUpTo(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  while (isInside(stop, current) && current !== stop) {
    try {
      await fs.rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

async function shouldOverwriteSyncedFile(filePath, siyuanId) {
  if (!(await pathExists(filePath))) {
    return true;
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = parseMarkdown(raw).data;
    return data.source === "siyuan" && data.siyuanId === siyuanId;
  } catch {
    return false;
  }
}

async function publishedStateFromExistingFile(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = parseMarkdown(raw);
    return parsed.data.source === "siyuan" ? parsePublished(parsed.data.published) : null;
  } catch {
    return null;
  }
}

async function uniqueArticlePath(relativePath, siyuanId) {
  let normalized = relativePath.replace(/\\/g, "/");
  let filePath = path.resolve(articlesDir, normalized);
  assertInside(articlesDir, filePath, "Synced article");

  if (await shouldOverwriteSyncedFile(filePath, siyuanId)) {
    return { filePath, relativePath: normalized };
  }

  const ext = path.extname(normalized);
  const base = normalized.slice(0, -ext.length);
  for (let index = 1; index <= 50; index += 1) {
    normalized = `${base}-${index}${ext}`;
    filePath = path.resolve(articlesDir, normalized);
    assertInside(articlesDir, filePath, "Synced article");
    if (await shouldOverwriteSyncedFile(filePath, siyuanId)) {
      return { filePath, relativePath: normalized };
    }
  }

  throw new Error(`Unable to create unique article path for ${relativePath}`);
}

function shouldSyncNotebook(notebook) {
  if (notebook.closed) {
    return false;
  }

  if (siyuanSyncIncludeNotebooks.length > 0) {
    return siyuanSyncIncludeNotebooks.includes(notebook.name);
  }

  return !siyuanSyncExcludeNotebooks.includes(notebook.name);
}

async function loginSiyuan() {
  if (!siyuanAccessAuthCode) {
    throw createApiError(503, "Siyuan auth code is not configured");
  }

  const response = await fetch(`${siyuanBaseUrl}/api/system/loginAuth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authCode: siyuanAccessAuthCode })
  });
  const payload = await response.json();

  if (!response.ok || payload.code !== 0) {
    if (String(payload.msg || "").toLowerCase().includes("captcha")) {
      throw createApiError(502, "Siyuan login requires captcha; configure SIYUAN_API_TOKEN for unattended sync");
    }
    throw createApiError(502, "Siyuan login failed");
  }

  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    throw createApiError(502, "Siyuan did not return a session cookie");
  }

  return cookie;
}

async function authenticateSiyuan() {
  if (siyuanApiToken) {
    return { Authorization: `Token ${siyuanApiToken}` };
  }

  return { Cookie: await loginSiyuan() };
}

async function siyuanApi(authHeaders, endpoint, body = {}) {
  const response = await fetch(`${siyuanBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok || payload.code !== 0) {
    throw createApiError(502, payload.msg || `Siyuan API failed: ${endpoint}`);
  }

  return payload.data;
}

async function listSiyuanDocs(authHeaders, notebook, parentPath = "/", parentSegments = []) {
  const data = await siyuanApi(authHeaders, "/api/filetree/listDocsByPath", {
    notebook: notebook.id,
    path: parentPath
  });
  const docs = [];

  for (const file of data.files || []) {
    if (file.hidden) {
      continue;
    }

    const segments = [...parentSegments, file.name];
    docs.push({
      id: file.id,
      name: file.name,
      path: file.path,
      segments,
      notebook,
      sort: Number(file.sort || 9999),
      ctime: file.ctime,
      mtime: file.mtime
    });

    if (file.subFileCount > 0) {
      docs.push(...(await listSiyuanDocs(authHeaders, notebook, file.path, segments)));
    }
  }

  return docs;
}

async function findSiyuanAsset(assetPath, assetRoots) {
  const cleaned = safeDecodeUrl(assetPath.split(/[?#]/)[0])
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");

  if (!cleaned.startsWith("assets/")) {
    return null;
  }

  const fileName = path.basename(cleaned);
  if (!fileName || fileName.startsWith(".")) {
    return null;
  }

  for (const root of assetRoots) {
    const candidate = path.resolve(root, fileName);
    if (isInside(root, candidate) && (await pathExists(candidate))) {
      return { fileName, sourcePath: candidate };
    }
  }

  return null;
}

async function copySiyuanAsset(url, assetRoots, stats) {
  if (!url || isExternalUrl(url) || url.startsWith("/media/")) {
    return url;
  }

  const [assetWithoutHash, hash = ""] = url.split("#");
  const [assetWithoutQuery, query = ""] = assetWithoutHash.split("?");
  const found = await findSiyuanAsset(assetWithoutQuery, assetRoots);
  if (!found) {
    return url;
  }

  const targetName = safeSegment(found.fileName, "asset");
  const targetPath = path.resolve(siyuanMediaDir, targetName);
  assertInside(siyuanMediaDir, targetPath, "Synced media");

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(found.sourcePath, targetPath);
  stats.assets.add(targetName);

  const suffix = `${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  return `${encodeMediaUrl(targetName)}${suffix}`;
}

async function rewriteSiyuanAssetLinks(markdown, assetRoots, stats) {
  const assetMatches = [...markdown.matchAll(/(?:^|[("'=\s])((?:\.\/|\/)?assets\/[^)"'\s>]+)/g)];
  const replacements = new Map();

  for (const match of assetMatches) {
    const original = match[1];
    if (!replacements.has(original)) {
      replacements.set(original, await copySiyuanAsset(original, assetRoots, stats));
    }
  }

  let rewritten = markdown;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }

  return rewritten;
}

async function cleanupStaleSyncedFiles(previousFiles, nextFiles) {
  let deleted = 0;

  for (const relativePath of previousFiles) {
    if (nextFiles.has(relativePath)) {
      continue;
    }

    const filePath = path.resolve(articlesDir, relativePath);
    if (!isInside(articlesDir, filePath) || !(await pathExists(filePath))) {
      continue;
    }

    const raw = await fs.readFile(filePath, "utf8");
    if (parseMarkdown(raw).data.source !== "siyuan") {
      continue;
    }

    await fs.unlink(filePath);
    await removeEmptyDirsUpTo(path.dirname(filePath), articlesDir);
    deleted += 1;
  }

  return deleted;
}

async function syncSiyuanToContent() {
  await ensureRuntime();
  await fs.mkdir(siyuanMediaDir, { recursive: true });

  const previousManifest = await readJsonFile(syncManifestPath, { files: [] });
  const knownSyncedFiles = new Set(previousManifest.files || []);
  const nextFiles = new Set();
  const previousSettings = new Map();
  for (const filePath of await walkMarkdownFiles(articlesDir)) {
    const { data } = parseMarkdown(await fs.readFile(filePath, "utf8"));
    if (data.source === "siyuan" && data.siyuanId) previousSettings.set(data.siyuanId, data);
  }
  const stats = {
    notebooks: 0,
    articles: 0,
    assets: new Set()
  };

  const authHeaders = await authenticateSiyuan();
  const notebooksData = await siyuanApi(authHeaders, "/api/notebook/lsNotebooks", {});
  const notebooks = (notebooksData.notebooks || []).filter(shouldSyncNotebook);
  const assetRoots = [
    path.join(siyuanWorkspaceDir, "data", "assets"),
    ...notebooks.map((notebook) => path.join(siyuanWorkspaceDir, "data", notebook.id, "assets"))
  ];

  for (const notebook of notebooks) {
    stats.notebooks += 1;
    const docs = await listSiyuanDocs(authHeaders, notebook);

    for (const doc of docs) {
      const exported = await siyuanApi(authHeaders, "/api/export/exportMdContent", { id: doc.id });
      const notebookSegment = safeSegment(notebook.name, notebook.id);
      const docSegments = doc.segments.map((segment, index) => safeSegment(segment, index === 0 ? doc.id : "untitled"));
      const fileName = `${docSegments.at(-1) || doc.id}.md`;
      const relativePath = path
        .join(notebookSegment, ...docSegments.slice(0, -1), fileName)
        .replace(/\\/g, "/");
      const { filePath, relativePath: finalRelativePath } = await uniqueArticlePath(relativePath, doc.id);
      const exportedContent = exported.content || "";
      const previous = previousSettings.get(doc.id) || {};
      const existingPublished = parsePublished(previous.published) ?? await publishedStateFromExistingFile(filePath);
      const exportedPublished = parsePublished(parseMarkdown(exportedContent).data.published);
      const published = existingPublished ?? exportedPublished ?? siyuanPublicNotebooks.includes(notebook.name);
      const content = published ? await rewriteSiyuanAssetLinks(exportedContent, assetRoots, stats) : exportedContent;
      const article = frontmatterWith(content, {
        title: doc.name,
        category: notebook.name,
        source: "siyuan",
        notebook: notebook.name,
        siyuanId: doc.id,
        order: doc.sort,
        updated: formatSiyuanTime(doc.mtime),
        created: formatSiyuanTime(doc.ctime),
        ...(previous.navigation ? { navigation: previous.navigation } : {}),
        published
      });

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, article, "utf8");
      nextFiles.add(finalRelativePath);
      stats.articles += 1;
    }
  }

  const deleted = await cleanupStaleSyncedFiles(knownSyncedFiles, nextFiles);
  const generatedAt = new Date().toISOString();
  await fs.writeFile(
    syncManifestPath,
    JSON.stringify(
      {
        generatedAt,
        files: [...nextFiles].sort((a, b) => a.localeCompare(b, "zh-CN")),
        assets: [...stats.assets].sort((a, b) => a.localeCompare(b, "zh-CN"))
      },
      null,
      2
    ),
    "utf8"
  );

  const index = await getIndex({ force: true });
  return {
    generatedAt,
    notebooks: stats.notebooks,
    articles: stats.articles,
    assets: stats.assets.size,
    deleted,
    index
  };
}

async function runSiyuanSync() {
  if (siyuanSyncPromise) {
    return siyuanSyncPromise;
  }

  siyuanSyncPromise = (async () => {
    const attemptedAt = new Date().toISOString();
    await writeSyncStatus({
      state: "running",
      lastAttemptAt: attemptedAt,
      error: null
    });

    try {
      const result = await syncSiyuanToContent();
      await writeSyncStatus({
        state: "success",
        lastAttemptAt: attemptedAt,
        lastSuccessAt: result.generatedAt,
        generatedAt: result.generatedAt,
        notebooks: result.notebooks,
        articles: result.articles,
        deleted: result.deleted,
        assets: result.assets,
        error: null
      });
      return result;
    } catch (error) {
      await writeSyncStatus({
        state: "failed",
        lastAttemptAt: attemptedAt,
        error: syncErrorMessage(error)
      });
      throw error;
    }
  })().finally(() => {
    siyuanSyncPromise = null;
  });
  return siyuanSyncPromise;
}

function publicArticle(article) {
  const { searchText, mediaFiles, published, fileId, hasBody, navigation, ...safeArticle } = article;
  return safeArticle;
}

function scoreSearch(article, terms) {
  let score = 0;
  const title = article.title.toLowerCase();
  const summary = article.summary.toLowerCase();

  for (const term of terms) {
    if (title.includes(term)) {
      score += 8;
    }
    if (summary.includes(term)) {
      score += 4;
    }
    if (article.tags.some((tag) => tag.toLowerCase().includes(term))) {
      score += 5;
    }
    if (article.searchText.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function articleUrlFromId(id) {
  return `/articles/${String(id)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function articleIdFromRoute(value) {
  try {
    return String(value || "")
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function sitemapDate(value) {
  const date = new Date(value);
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString().slice(0, 10);
}

function renderDocument(template, { title, description, canonicalPath, robots = "index,follow" }) {
  const canonical = `${publicOrigin}${canonicalPath}`;
  return template
    .replaceAll("__KB_TITLE__", escapeHtml(title))
    .replaceAll("__KB_DESCRIPTION__", escapeHtml(description))
    .replaceAll("__KB_CANONICAL__", escapeHtml(canonical))
    .replaceAll("__KB_ROBOTS__", escapeHtml(robots));
}

function matchesAdminToken(value) {
  if (!adminSecret || typeof value !== "string") {
    return false;
  }

  const expected = Buffer.from(adminSecret);
  const received = Buffer.from(value);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function readCookie(req, name) {
  const prefix = `${name}=`;
  return String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

function adminSessionSignature(expiresAt) {
  return crypto.createHmac("sha256", adminSecret).update(String(expiresAt)).digest("base64url");
}

function createAdminSession() {
  const expiresAt = Date.now() + adminSessionTtlSeconds * 1000;
  return `${expiresAt}.${adminSessionSignature(expiresAt)}`;
}

function hasAdminSession(req) {
  if (!adminSecret) {
    return false;
  }

  const [expiresAt, signature] = readCookie(req, adminSessionCookieName).split(".");
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now() || !signature) {
    return false;
  }

  const expected = Buffer.from(adminSessionSignature(expires));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function hasAdminAccess(req) {
  const authorization = String(req.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return matchesAdminToken(token) || hasAdminSession(req);
}

function adminSessionCookie(value, maxAge = adminSessionTtlSeconds) {
  return [
    `${adminSessionCookieName}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProduction ? "Secure" : "",
    `Max-Age=${maxAge}`
  ]
    .filter(Boolean)
    .join("; ");
}

function canAttemptAdminLogin(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempts = (adminLoginAttempts.get(key) || []).filter((time) => now - time < adminLoginWindowMs);
  if (attempts.length >= adminLoginMaxAttempts) {
    adminLoginAttempts.set(key, attempts);
    return false;
  }
  attempts.push(now);
  adminLoginAttempts.set(key, attempts);
  return true;
}

function clearAdminLoginAttempts(req) {
  adminLoginAttempts.delete(req.socket.remoteAddress || "unknown");
}

function requireAdmin(req, res, next) {
  if (!hasAdminAccess(req)) {
    res.status(404).json({ error: "API route not found" });
    return;
  }
  next();
}

async function getPublishedArticle(id) {
  const normalized = normalizeArticleId(id);
  if (!normalized) {
    throw createApiError(400, "Invalid article id");
  }
  const index = await getIndex();
  const document = index.documents.find((item) => item.id === normalized || item.path === normalized) ||
    index.documents.find((item) => item.id === index.aliases.get(normalized));
  const filePath = document && articlePathFromId(document.fileId);
  if (!filePath) throw createApiError(404, "Article not found");
  if (!(await pathExists(filePath))) {
    throw createApiError(404, "Article not found");
  }

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parseMarkdown(raw);
  const meta = { ...await readArticleMeta(filePath), isDirectory: document.isDirectory, isOverview: document.isOverview };
  if (!meta.published) {
    throw createApiError(404, "Article not found");
  }

  return { raw, parsed, meta };
}

async function publicKnowledgeBasePayload() {
  const index = await getIndex();
  return {
    generatedAt: index.generatedAt,
    articles: index.articles.map(publicArticle),
    tree: index.tree,
    categories: index.categories,
    links: { editor: /^https?:\/\//i.test(editorUrl) ? editorUrl : null },
    sync: publicSyncStatus(await readSyncStatus())
  };
}

function createApiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    });
    next();
  });
  app.use(express.json({ limit: "128kb" }));

  app.get(
    "/media/*",
    asyncRoute(async (req, res) => {
      const relativePath = String(req.params[0] || "").replace(/^\/+/, "");
      const filePath = path.resolve(mediaDir, relativePath);
      if (!relativePath || !isInside(mediaDir, filePath)) {
        throw createApiError(404, "Media not found");
      }

      const index = await getIndex();
      const normalizedPath = path.relative(mediaDir, filePath).replace(/\\/g, "/");
      if (!index.mediaFiles.has(normalizedPath) || !(await pathExists(filePath))) {
        throw createApiError(404, "Media not found");
      }

      res.sendFile(filePath, { dotfiles: "deny" });
    })
  );
  app.use("/public-assets", express.static(publicDir, { dotfiles: "deny", index: false }));

  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      const index = await getIndex();
      res.json({
      ok: true,
      site: "myblog",
        contentRoot: "content/articles",
        articles: index.articles.length,
        sync: publicSyncStatus(await readSyncStatus())
      });
    })
  );

  app.get(
    "/api/status",
    asyncRoute(async (_req, res) => {
      const index = await getIndex();
      res.json({
        generatedAt: index.generatedAt,
        articles: index.articles.length,
        sync: publicSyncStatus(await readSyncStatus())
      });
    })
  );

  app.get(
    "/api/kb",
    asyncRoute(async (_req, res) => {
      res.json(await publicKnowledgeBasePayload());
    })
  );

  app.get(
    "/api/article",
    asyncRoute(async (req, res) => {
      const { parsed, meta } = await getPublishedArticle(req.query.id);

      res.json({
        article: publicArticle(meta),
        content: parsed.content
      });
    })
  );

  app.get(
    "/api/search",
    asyncRoute(async (req, res) => {
      const query = String(req.query.q || "").trim().toLowerCase();
      const terms = query.split(/\s+/).filter(Boolean);
      const category = String(req.query.category || "").trim();
      const tag = String(req.query.tag || "").trim().toLowerCase();
      const index = await getIndex();
      const results = index.articles
        .filter((article) => !category || article.category === category)
        .filter((article) => !tag || article.tags.some((item) => item.toLowerCase() === tag))
        .map((article) => ({ article, score: terms.length > 0 ? scoreSearch(article, terms) : 1 }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "zh-CN"))
        .slice(0, 30)
        .map((item) => publicArticle(item.article));

      res.json({ query, category, tag, results });
    })
  );

  app.get("/api/admin/session", (req, res) => {
    res.json({ authenticated: hasAdminAccess(req) });
  });

  app.post("/api/admin/login", (req, res) => {
    if (!adminSecret) {
      res.status(503).json({ error: "Website tools are not configured" });
      return;
    }

    if (!canAttemptAdminLogin(req)) {
      res.status(429).json({ error: "Too many login attempts. Try again later." });
      return;
    }

    if (!matchesAdminToken(String(req.body?.password || ""))) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    clearAdminLoginAttempts(req);
    res.setHeader("Set-Cookie", adminSessionCookie(createAdminSession()));
    res.json({ ok: true });
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.setHeader("Set-Cookie", adminSessionCookie("", 0));
    res.status(204).end();
  });

  app.use("/api/admin", requireAdmin);

  app.post(
    "/api/admin/reindex",
    asyncRoute(async (_req, res) => {
      const index = await getIndex({ force: true });
      res.json({
        ok: true,
        total: index.articles.length,
        ...(await publicKnowledgeBasePayload())
      });
    })
  );

  app.post(
    "/api/admin/sync-siyuan",
    asyncRoute(async (_req, res) => {
      const result = await runSiyuanSync();

      res.json({
        ok: true,
        sync: {
          generatedAt: result.generatedAt,
          notebooks: result.notebooks,
          articles: result.articles,
          assets: result.assets,
          deleted: result.deleted
        },
        total: result.index.articles.length,
        ...(await publicKnowledgeBasePayload())
      });
    })
  );

  app.get(
    "/sitemap.xml",
    asyncRoute(async (_req, res) => {
      const index = await getIndex();
      const urls = [
        { loc: `${publicOrigin}/`, lastmod: index.generatedAt },
        { loc: `${publicOrigin}/articles`, lastmod: index.generatedAt },
        { loc: `${publicOrigin}/directory`, lastmod: index.generatedAt },
        ...index.articles.map((article) => ({
          loc: `${publicOrigin}${articleUrlFromId(article.id)}`,
          lastmod: article.updatedAt || index.generatedAt
        }))
      ];
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((url) => `  <url><loc>${escapeXml(url.loc)}</loc><lastmod>${escapeXml(sitemapDate(url.lastmod))}</lastmod></url>`),
        "</urlset>"
      ].join("\n");
      res.type("application/xml").send(xml);
    })
  );

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${publicOrigin}/sitemap.xml\n`);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({
      error: status === 500 ? "Internal server error" : err.message
    });
  });

  if (isProduction) {
    const pageTemplate = await fs.readFile(path.join(distDir, "index.html"), "utf8");
    app.get(
      "/articles/*",
      asyncRoute(async (req, res) => {
        const id = articleIdFromRoute(req.params[0]);
        const { meta } = await getPublishedArticle(id);
        if (id !== meta.id) {
          res.redirect(308, articleUrlFromId(meta.id));
          return;
        }
        res.type("html").send(
          renderDocument(pageTemplate, {
            title: `${meta.title} | myBlog 知识库`,
            description: meta.summary || `${meta.title} - myBlog 知识库`,
            canonicalPath: articleUrlFromId(meta.id)
          })
        );
      })
    );
    app.use(express.static(distDir, { index: false }));
    app.get("*", asyncRoute(async (req, res) => {
      const url = new URL(req.originalUrl, publicOrigin);
      if (url.pathname === "/categories") {
        res.redirect(308, `/directory${url.search}`);
        return;
      }
      const route = routeFromUrl(url);
      const folder = route.folder ? findFolder((await getIndex()).tree, route.folder) : null;
      const missing = route.invalid || route.page === "not-found" || (route.folder && !folder);
      const pageTitles = { home: "myBlog · 技术笔记与项目记录", directory: "目录 · myBlog", articles: "文章 · myBlog", tools: "工具 · myBlog", about: "关于 · myBlog" };
      const title = missing ? "页面不存在 · myBlog" : route.collection ? `${route.collection.value} · myBlog` : folder ? `${folder.name} · myBlog` : pageTitles[route.page];
      const canonicalPath = folder ? folderPath(folder.path) : `${url.pathname}${url.search}`;
      if (missing) res.status(404);
      res.type("html").send(
        renderDocument(pageTemplate, {
          title,
          description: folder ? `${folder.name}，${folder.articleCount} 篇公开文章。` : "技术笔记、项目记录与知识整理。",
          canonicalPath,
          robots: missing || route.page === "tools" ? "noindex,nofollow" : "index,follow"
        })
      );
    }));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: siteDir,
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }

  return app;
}

function scheduleSiyuanAutoSync() {
  if (
    !Number.isFinite(siyuanSyncIntervalSeconds) ||
    siyuanSyncIntervalSeconds <= 0 ||
    (!siyuanAccessAuthCode && !siyuanApiToken)
  ) {
    return;
  }

  const baseDelayMs = Math.max(30, siyuanSyncIntervalSeconds) * 1000;
  let nextDelayMs = baseDelayMs;
  const sync = async () => {
    runSiyuanSync()
      .then((result) => {
        console.log(
          `Siyuan sync completed: notebooks=${result.notebooks}, articles=${result.articles}, deleted=${result.deleted}`
        );
        nextDelayMs = baseDelayMs;
      })
      .catch((error) => {
        console.warn(`Siyuan sync skipped: ${error.message}`);
        nextDelayMs = Math.min(nextDelayMs * 2, 60 * 60 * 1000);
      })
      .finally(() => {
        setTimeout(sync, nextDelayMs).unref?.();
      });
  };

  setTimeout(sync, 3000).unref?.();
}

await ensureRuntime();
await getIndex({ force: true });

const app = await createApp();
app.listen(port, host, () => {
  console.log(`myBlog knowledge site listening on http://${host}:${port}`);
  scheduleSiyuanAutoSync();
});
