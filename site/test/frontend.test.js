import assert from "node:assert/strict";
import { test } from "node:test";
import { articlePath, folderPath, findFolder, articleFolder } from "../shared/navigation.js";
import { routeFromUrl } from "../shared/routes.js";
import { renderArticle } from "../src/lib/markdown.js";

test("article and folder URLs preserve Unicode hierarchy and reserved characters", () => {
  const folder = "公开知识库/电源 #1/目录 & 配置";
  assert.equal(routeFromUrl(folderPath(folder)).folder, folder);
  assert.equal(routeFromUrl(articlePath("siyuan/test-document")).articleId, "siyuan/test-document");
  assert.equal(routeFromUrl("/?article=siyuan%2Fstable-id").articleId, "siyuan/stable-id");
  assert.equal(routeFromUrl("/directory/%E0%A4%A").invalid, true);
  assert.equal(routeFromUrl("/directory/a%2Fb").invalid, true);
});

test("directory selection keeps overview articles and their children in one folder", () => {
  const folder = { type: "folder", path: "notes/power", overview: { id: "overview" }, children: [{ type: "article", id: "leaf" }] };
  const tree = { type: "root", children: [{ type: "folder", path: "notes", children: [folder] }] };
  assert.equal(findFolder(tree, "notes/power"), folder);
  assert.equal(findFolder(tree, "missing"), null);
  assert.equal(articleFolder(tree, "overview"), folder);
  assert.equal(articleFolder(tree, "leaf"), folder);
});

test("reading removes the repeated document title while preserving unique section anchors", () => {
  const rendered = renderArticle("# 电源\n\n介绍。\n\n## 电源\n\n内容\n\n## 电源\n\n更多。", "电源");
  assert.doesNotMatch(rendered.html, /<h1/);
  assert.deepEqual(rendered.headings.map((heading) => heading.id), ["电源-2", "电源-3"]);
  for (const heading of rendered.headings) assert.ok(rendered.html.includes(`id="${heading.id}"`));
});

test("Markdown examples inside code blocks cannot create false TOC entries or execute HTML", () => {
  const rendered = renderArticle('# Guide\n\n```md\n# Example\n```\n\n## **Real** heading\n\n<script>alert(1)</script>', "Guide");
  assert.equal(rendered.headings.length, 1);
  assert.equal(rendered.headings[0].text, "Real heading");
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;/);
});
