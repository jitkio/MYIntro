import assert from "node:assert/strict";
import { test } from "node:test";
import { articlePath, folderPath, findFolder, articleFolder } from "../shared/navigation.js";
import { routeFromUrl } from "../shared/routes.js";

test("article and folder URLs preserve Unicode hierarchy and reserved characters", () => {
  const folder = "公开知识库/电源 #1/目录 & 配置";
  assert.equal(folderPath(folder), "/directory/%E5%85%AC%E5%BC%80%E7%9F%A5%E8%AF%86%E5%BA%93/%E7%94%B5%E6%BA%90%20%231/%E7%9B%AE%E5%BD%95%20%26%20%E9%85%8D%E7%BD%AE");
  assert.equal(routeFromUrl(folderPath(folder)).folder, folder);
  const article = "公开知识库/Magent/Overview #1";
  assert.equal(articlePath(article), "/articles/%E5%85%AC%E5%BC%80%E7%9F%A5%E8%AF%86%E5%BA%93/Magent/Overview%20%231");
  assert.equal(routeFromUrl(articlePath(article)).articleId, article);
});

test("share routes parse isolated share parameters without affecting normal articles", () => {
  const share = routeFromUrl("https://example.com/share/%E6%B5%8B%E8%AF%95%E6%96%87%E7%AB%A0?token=mytoken123");
  assert.equal(share.page, "share");
  assert.equal(share.articleId, "测试文章");
  assert.equal(share.token, "mytoken123");
  assert.equal(share.isShare, true);
  assert.equal(share.invalid, false);

  const normal = routeFromUrl("https://example.com/articles/%E6%B5%8B%E8%AF%95%E6%96%87%E7%AB%A0");
  assert.equal(normal.page, "articles");
  assert.equal(normal.articleId, "测试文章");
  assert.equal(normal.isShare, undefined);
});
