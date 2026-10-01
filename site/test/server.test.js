import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let projectRoot;
let server;
let port;
let serverError = "";

function reservePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start: ${serverError || lastError?.message || "unknown error"}`);
}

before(async () => {
  projectRoot = await mkdtemp(path.join(os.tmpdir(), "myblog-test-"));
  const articles = path.join(projectRoot, "content", "articles");
  const media = path.join(projectRoot, "content", "media");
  const publicDir = path.join(projectRoot, "public");
  await mkdir(articles, { recursive: true });
  await mkdir(media, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  await writeFile(
    path.join(articles, "public.md"),
    "---\ntitle: Public article\ncategory: Docs\ntags: [Guide]\npublished: true\nupdated: 2026-07-27\n---\n\n# Public article\n\n![cover](/media/cover.txt)\n",
    "utf8"
  );
  await writeFile(
    path.join(articles, "draft.md"),
    "---\ntitle: Draft article\npublished: false\n---\n\n# Draft article\n",
    "utf8"
  );
  await writeFile(path.join(media, "cover.txt"), "published media", "utf8");
  await writeFile(path.join(media, "hidden.txt"), "private media", "utf8");

  port = await reservePort();
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: siteDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      KB_HOST: "127.0.0.1",
      KB_PORT: String(port),
      KB_PROJECT_ROOT: projectRoot,
      KB_CONTENT_DIR: path.join(projectRoot, "content"),
      KB_RUNTIME_DIR: path.join(projectRoot, "runtime"),
      KB_PUBLIC_DIR: publicDir,
      KB_SIYUAN_WORKSPACE_DIR: path.join(projectRoot, "siyuan", "workspace"),
      KB_ADMIN_TOKEN: "TEST_ONLY_ADMIN_NOT_A_SECRET",
      SIYUAN_ACCESS_AUTH_CODE: ""
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  server.stderr.on("data", (chunk) => {
    serverError += chunk.toString();
  });
  await waitForServer(`http://127.0.0.1:${port}/api/health`);
});

after(async () => {
  server?.kill();
  await rm(projectRoot, { recursive: true, force: true });
});

test("only published content and referenced media are public", async () => {
  const kb = await fetch(`http://127.0.0.1:${port}/api/kb`).then((response) => response.json());
  assert.equal(kb.articles.length, 1);
  assert.equal(kb.articles[0].id, "public");
  assert.equal("published" in kb.categories[0].articles[0], false);
  assert.equal("mediaFiles" in kb.categories[0].articles[0], false);

  assert.equal((await fetch(`http://127.0.0.1:${port}/api/article?id=draft`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/media/cover.txt`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/media/hidden.txt`)).status, 404);
});

test("write APIs require the admin bearer token", async () => {
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/reindex`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/admin/reindex`, { method: "POST" })).status, 404);

  const response = await fetch(`http://127.0.0.1:${port}/api/admin/reindex`, {
    method: "POST",
    headers: { Authorization: "Bearer TEST_ONLY_ADMIN_NOT_A_SECRET" }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 1);
});

test("website tools can use a short-lived authenticated session", async () => {
  const failedLogin = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" })
  });
  assert.equal(failedLogin.status, 401);

  const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "TEST_ONLY_ADMIN_NOT_A_SECRET" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^myblog_admin_session=/);

  const session = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await session.json()).authenticated, true);

  const reindex = await fetch(`http://127.0.0.1:${port}/api/admin/reindex`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(reindex.status, 200);
});

test("article routes and sitemap expose only published URLs", async () => {
  assert.equal((await fetch(`http://127.0.0.1:${port}/articles/public`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/articles/draft`)).status, 404);

  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`).then((response) => response.text());
  assert.match(sitemap, /articles\/public/);
  assert.doesNotMatch(sitemap, /articles\/draft/);
});
