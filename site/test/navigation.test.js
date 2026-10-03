import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { hasArticleBody } from "../server/navigation.js";
import { renderArticle } from "../src/lib/markdown.js";

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let root, server, mockSiyuan, port, articlesDir;
let serverError = "";
const oldLeafPath = "公开/专题/章节/正文";
const stableId = "siyuan/test-article";
const adminHeaders = { Authorization: "Bearer TEST_ONLY_ADMIN_NOT_A_SECRET" };
const url = (route) => `http://127.0.0.1:${port}${route}`;

async function writeArticle(relativePath, data, body) {
  const target = path.join(articlesDir, `${relativePath}.md`);
  await mkdir(path.dirname(target), { recursive: true });
  const header = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  await writeFile(target, `---\n${header}\n---\n${body}`, "utf8");
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
}

async function startServer() {
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: siteDir,
    env: {
      ...process.env,
      NODE_ENV: "production", KB_HOST: "127.0.0.1", KB_PORT: String(port),
      KB_PROJECT_ROOT: root, KB_DATA_DIR: root,
      KB_CONTENT_DIR: path.join(root, "content"), KB_RUNTIME_DIR: path.join(root, "runtime"),
      KB_PUBLIC_DIR: path.join(root, "public"), KB_SIYUAN_WORKSPACE_DIR: path.join(root, "siyuan"),
      KB_ADMIN_TOKEN: "TEST_ONLY_ADMIN_NOT_A_SECRET", SIYUAN_ACCESS_AUTH_CODE: "", SIYUAN_API_TOKEN: "TEST_ONLY_SIYUAN_NOT_A_SECRET",
      SIYUAN_BASE_URL: `http://127.0.0.1:${mockSiyuan.address().port}`,
      SIYUAN_SYNC_INTERVAL_SECONDS: "0", SIYUAN_SYNC_NOTEBOOKS: "公开", SIYUAN_PUBLIC_NOTEBOOKS: "公开"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  server.stderr.on("data", (chunk) => { serverError += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url("/api/health"))).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${serverError}`);
}

async function reindex() {
  const response = await fetch(url("/api/admin/reindex"), { method: "POST", headers: adminHeaders });
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "myblog-navigation-test-"));
  articlesDir = path.join(root, "content", "articles");
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeArticle("公开/专题", { title: "专题", published: true, source: "siyuan", siyuanId: "book" }, "# 专题\n\n专题介绍。\n");
  await writeArticle("公开/专题/章节", { title: "章节", published: true, source: "siyuan", siyuanId: "chapter" }, "# 章节\n\n‍\n");
  await writeArticle(oldLeafPath, { title: "正文", published: true, source: "siyuan", siyuanId: "test-article", navigation: "article" }, "# 正文\n\n这是正文。\n");
  await writeArticle("公开/专题/空白叶文档", { title: "空白叶文档", published: true }, "# 空白叶文档\n");
  await writeArticle("公开/旧草稿", { title: "旧草稿", published: false, source: "siyuan", siyuanId: "draft", navigation: "folder" }, "# 旧草稿\n");
  const assets = path.join(root, "siyuan", "data", "assets");
  await mkdir(assets, { recursive: true });
  for (const name of ["演示.mp4", "voice.mp3", "poster.png"]) {
    await writeFile(path.join(assets, name), Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz"));
  }

  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  mockSiyuan = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    let data;
    if (req.url === "/api/notebook/lsNotebooks") {
      data = { notebooks: [{ id: "notebook", name: "公开", closed: false }] };
    } else if (req.url === "/api/filetree/listDocsByPath") {
      data = { files: [
        { id: "test-article", name: "新名字", path: "/article.sy" },
        { id: "draft", name: "新草稿名字", path: "/draft.sy" },
        { id: "same-one", name: "同名文档", path: "/one.sy" },
        { id: "same-two", name: "同名文档", path: "/two.sy" }
      ] };
    } else if (req.url === "/api/export/exportMdContent") {
      const media = body.id === "same-one" ? '\n<video src="assets/%E6%BC%94%E7%A4%BA.mp4" poster="assets/poster.png" controls></video>\n\n<audio><source src="assets/voice.mp3" type="audio/mpeg"></audio>\n' : "";
      data = { content: `# 导出文档\n\nContent for ${body.id}.\n${media}` };
    } else {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: 0, data }));
  });
  await new Promise((resolve) => mockSiyuan.listen(0, "127.0.0.1", resolve));
  await startServer();
});

after(async () => {
  await stopServer();
  if (mockSiyuan) await new Promise((resolve) => mockSiyuan.close(resolve));
  // Verify this recursive cleanup is limited to our own temporary test directory.
  if (root && path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("myblog-navigation-test-")) {
    await rm(root, { recursive: true, force: true });
  }
});

test("folders omit empty parent articles and expose substantive parent content once", async () => {
  const kb = await fetch(url("/api/kb")).then((response) => response.json());
  assert.equal(kb.articles.length, 3);
  assert.equal(kb.articles.some((article) => article.title === "章节"), false);
  const book = kb.tree.children[0].children[0];
  assert.equal(book.name, "专题");
  assert.equal(book.overview.id, "siyuan/book");
  assert.equal(book.children.some((node) => node.id === "siyuan/book"), false);
  assert.equal(book.articleCount, 3);
  const chapter = book.children.find((node) => node.name === "章节");
  assert.equal(chapter.overview, undefined);
  assert.equal(chapter.children[0].id, stableId);
  assert.equal(kb.categories.reduce((sum, category) => sum + category.count, 0), 3);
  const search = await fetch(url("/api/search?q=章节")).then((response) => response.json());
  assert.equal(search.results.some((article) => article.id === "siyuan/chapter"), false);
  const sitemap = await fetch(url("/sitemap.xml")).then((response) => response.text());
  assert.doesNotMatch(sitemap, /articles\/siyuan\/chapter/);
  assert.equal(hasArticleBody("# 标题\n\n‍\n", "标题"), false);
  assert.equal(hasArticleBody("# 标题\n\n![image](/media/a.png)", "标题"), true);
  assert.equal(hasArticleBody("# 标题\n\n## 内容小节", "标题"), true);
});

test("stable URLs and old path aliases survive moving, renaming and a server restart", async () => {
  const movedPath = "公开/新目录/新标题";
  await mkdir(path.join(articlesDir, "公开", "新目录"), { recursive: true });
  await rename(path.join(articlesDir, `${oldLeafPath}.md`), path.join(articlesDir, `${movedPath}.md`));
  await writeArticle(movedPath, { title: "新标题", published: true, source: "siyuan", siyuanId: "test-article", navigation: "article" }, "# 新标题\n\n移动后的正文。\n");
  await reindex();
  await stopServer();
  await startServer();
  for (const id of [stableId, oldLeafPath, movedPath]) {
    const response = await fetch(url(`/api/article?id=${encodeURIComponent(id)}`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).article.id, stableId);
  }
  const oldRoute = oldLeafPath.split("/").map(encodeURIComponent).join("/");
  const redirect = await fetch(url(`/articles/${oldRoute}`), { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), `/articles/${stableId}`);
  await writeArticle(movedPath, { title: "新标题", published: false, source: "siyuan", siyuanId: "test-article", navigation: "article" }, "# 新标题\n\n私密正文。\n");
  await reindex();
  assert.equal((await fetch(url(`/api/article?id=${encodeURIComponent(oldLeafPath)}`))).status, 404);
  await writeArticle(movedPath, { title: "新标题", published: true, source: "siyuan", siyuanId: "test-article", navigation: "article" }, "# 新标题\n\n正文。\n");
});

test("SiYuan sync preserves publication and navigation settings by ID and retains same-name documents", async () => {
  await mkdir(path.join(root, "runtime", "index"), { recursive: true });
  await writeFile(path.join(root, "runtime", "index", "siyuan-sync-manifest.json"), JSON.stringify({ files: ["公开/新目录/新标题.md", "公开/旧草稿.md"] }), "utf8");
  const response = await fetch(url("/api/admin/sync-siyuan"), { method: "POST", headers: adminHeaders });
  assert.equal(response.status, 200);
  const kb = await response.json();
  assert.equal(kb.articles.find((article) => article.id === stableId).title, "新名字");
  assert.equal(kb.articles.some((article) => article.id === "siyuan/draft"), false);
  assert.equal(kb.articles.filter((article) => ["siyuan/same-one", "siyuan/same-two"].includes(article.id)).length, 2);
  const draftRaw = await readFile(path.join(articlesDir, "公开", "新草稿名字.md"), "utf8");
  const draftMeta = parseYaml(draftRaw.split("---")[1]);
  assert.equal(draftMeta.published, false);
  assert.equal(draftMeta.navigation, "folder");
  const articleRaw = await readFile(path.join(articlesDir, "公开", "新名字.md"), "utf8");
  assert.equal(parseYaml(articleRaw.split("---")[1]).navigation, "article");
  assert.equal((await fetch(url(`/api/article?id=${encodeURIComponent(oldLeafPath)}`))).status, 200);
});

test("SiYuan exported video, audio and posters are copied, rewritten and made playable", async () => {
  const data = await fetch(url("/api/article?id=siyuan/same-one")).then((response) => response.json());
  assert.doesNotMatch(data.content, /["']assets\//);
  const rendered = renderArticle(data.content, data.article.title);
  assert.match(rendered.html, /<video controls/);
  assert.match(rendered.html, /<audio controls/);
  for (const name of ["演示.mp4", "voice.mp3", "poster.png"]) {
    assert.equal((await fetch(url(`/media/siyuan/${encodeURIComponent(name)}`))).status, 200);
  }
});
