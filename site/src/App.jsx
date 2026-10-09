import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, LockKeyhole } from "lucide-react";
import SiteHeader from "./components/SiteHeader.jsx";
import SiteLink, { NavigationContext } from "./components/SiteLink.jsx";
import Modal from "./components/Modal.jsx";
import DirectoryTree from "./components/DirectoryTree.jsx";
import SearchDialog from "./components/SearchDialog.jsx";
import HomePage from "./pages/HomePage.jsx";
import ArticlesPage from "./pages/ArticlesPage.jsx";
import DirectoryPage from "./pages/DirectoryPage.jsx";
import ArticlePage from "./pages/ArticlePage.jsx";
import ToolsPage from "./pages/ToolsPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import { articlePath, findFolder } from "../shared/navigation.js";
import { routeFromUrl } from "../shared/routes.js";
import { requestJson } from "./lib/content.js";

const emptyKb = { articles: [], tree: { type: "root", children: [] }, categories: [] };
const pageNames = { home: "myBlog", directory: "目录", articles: "文章", tools: "工具", about: "关于", share: "分享文章", "not-found": "页面不存在" };
function WideBoard({ children }) {
  return <div className="container wide-board"><section id="board"><div className="simple-page">{children}</div></section></div>;
}

function SiteLockBoard({ onUnlocked }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setError("");
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      onUnlocked();
    } catch (err) {
      setError(err.status === 401 ? "访问口令不正确。" : "暂时无法验证，请稍后重试。");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <WideBoard>
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ marginBottom: "1.2rem", display: "inline-flex", padding: "1rem", borderRadius: "50%", background: "var(--line-color)" }}>
          <LockKeyhole size={36} style={{ color: "var(--sec-text-color)" }} />
        </div>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, marginBottom: "0.6rem" }}>站点已开启访问保护</h2>
        <p className="muted" style={{ marginBottom: "1.8rem" }}>
          该知识库为私有站点，请输入访问口令后继续浏览。
        </p>
        <form className="tools-login" onSubmit={handleSubmit} style={{ justifyContent: "center", margin: "0 auto" }}>
          <input
            type="password"
            placeholder="请输入访问口令"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            style={{ width: "240px" }}
          />
          <button type="submit" className="plain-primary" disabled={loggingIn}>
            {loggingIn ? "验证中…" : "解锁访问"}
          </button>
        </form>
        {error && <p className="tools-message" role="status" style={{ color: "#e55353", marginTop: "1rem" }}>{error}</p>}
      </div>
    </WideBoard>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => routeFromUrl(window.location.href));
  const [kb, setKb] = useState(emptyKb);
  const [loadingKb, setLoadingKb] = useState(!route.isShare);
  const [kbError, setKbError] = useState(false);
  const [articleData, setArticleData] = useState(null);
  const [loadingArticle, setLoadingArticle] = useState(Boolean(route.articleId));
  const [articleError, setArticleError] = useState("");
  const [modal, setModal] = useState(null);
  const [theme, setTheme] = useState(() => { try { return window.localStorage.getItem("myblog-color-scheme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  const [showTop, setShowTop] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const navigate = useCallback((path) => {
    const url = new URL(path, window.location.origin);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    setRoute(routeFromUrl(url)); setModal(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const loadKb = useCallback(async (signal) => {
    if (route.isShare) {
      setLoadingKb(false);
      return;
    }
    setLoadingKb(true); setKbError(false);
    try {
      const data = await requestJson("/api/kb", { signal });
      setKb(data);
    }
    catch (error) {
      if (error.name !== "AbortError") {
        if (error.status === 401) {
          setKb({ ...emptyKb, isPrivate: true });
        } else {
          setKbError(true);
        }
      }
    }
    finally { if (!signal?.aborted) setLoadingKb(false); }
  }, [route.isShare]);
  useEffect(() => {
    const controller = new AbortController(); loadKb(controller.signal);
    return () => controller.abort();
  }, [loadKb]);
  useEffect(() => {
    const pop = () => { setRoute(routeFromUrl(window.location.href)); setModal(null); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.userColorScheme = theme;
    try { window.localStorage.setItem("myblog-color-scheme", theme); } catch { /* Theme works without persistence. */ }
  }, [theme]);
  useEffect(() => {
    const listener = () => setShowTop(window.scrollY > 350);
    const shortcut = (event) => {
      if (route.isShare || kb.isPrivate) return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest("input, textarea, [contenteditable]")) { event.preventDefault(); setModal((current) => current || "search"); }
    };
    window.addEventListener("scroll", listener, { passive: true }); window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("scroll", listener); window.removeEventListener("keydown", shortcut); };
  }, [route.isShare, kb.isPrivate]);
  useEffect(() => {
    setArticleData(null); setArticleError("");
    if (!route.articleId) { setLoadingArticle(false); return; }
    const controller = new AbortController(); setLoadingArticle(true);
    const endpoint = route.isShare
      ? `/api/share/article?id=${encodeURIComponent(route.articleId)}&token=${encodeURIComponent(route.token || "")}`
      : `/api/article?id=${encodeURIComponent(route.articleId)}`;

    requestJson(endpoint, { signal: controller.signal }).then((data) => {
      setArticleData(data);
      if (!route.isShare && data.article.id !== route.articleId) {
        const url = new URL(window.location.href); url.pathname = articlePath(data.article.id); url.searchParams.delete("article");
        window.history.replaceState(null, "", url); setRoute(routeFromUrl(url));
      }
    }).catch((error) => {
      if (error.name !== "AbortError") {
        if (route.isShare) {
          setArticleError("此专属分享链接无效或已失效，无权访问该文章。");
        } else if (error.status === 401) {
          setKb((prev) => ({ ...prev, isPrivate: true }));
        } else {
          setArticleError(error.status === 404 ? "这篇文章不存在或尚未公开。" : "文章暂时无法读取，请稍后重试。");
        }
      }
    }).finally(() => { if (!controller.signal.aborted) setLoadingArticle(false); });
    return () => controller.abort();
  }, [route.articleId, route.isShare, route.token]);

  const folder = useMemo(() => route.folder ? findFolder(kb.tree, route.folder) : null, [kb.tree, route.folder]);
  const currentData = articleData?.article.id === route.articleId ? articleData : null;
  const article = currentData?.article || kb.articles.find((item) => item.id === route.articleId);
  const missing = route.invalid || route.page === "not-found" || (!loadingKb && !route.isShare && Boolean(route.folder) && !folder);
  const title = missing ? "页面不存在" : articleError ? "文章无法读取" : route.articleId ? article?.title || "正在读取文章" : route.collection?.value || folder?.name || pageNames[route.page];
  const subtitle = route.page === "home" && !route.articleId && !route.collection ? "技术笔记与项目记录" : "";
  useEffect(() => {
    document.title = title === "myBlog" ? "myBlog · 技术笔记与项目记录" : `${title} · myBlog`;
    const description = article?.summary || "技术笔记、项目记录与知识整理。";
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    const canonical = new URL(window.location.href); canonical.hash = "";
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical.href);
  }, [title, article, route]);

  let content;
  if (kb.isPrivate && !route.isShare) content = <SiteLockBoard onUnlocked={() => loadKb()} />;
  else if (kbError && !route.isShare) content = <WideBoard><p>暂时无法读取文章列表。</p><button type="button" className="plain-primary" onClick={() => loadKb()}>重新读取</button></WideBoard>;
  else if (missing) content = <WideBoard><p className="muted">这个页面不存在。</p>{!route.isShare && <SiteLink to="/directory">返回目录 →</SiteLink>}</WideBoard>;
  else if (loadingKb || loadingArticle || (route.articleId && !currentData && !articleError)) content = <WideBoard><p className="muted" role="status">正在读取内容…</p></WideBoard>;
  else if (articleError) content = <WideBoard><p className="muted">{articleError}</p>{!route.isShare && <SiteLink to="/articles">返回文章索引 →</SiteLink>}</WideBoard>;
  else if (route.articleId && currentData) content = <ArticlePage key={currentData.article.id} article={currentData.article} content={currentData.content} kb={route.isShare ? emptyKb : kb} isShare={route.isShare} onDirectory={() => setModal("directory")} />;
  else if (route.collection || route.page === "articles") content = <WideBoard><ArticlesPage kb={kb} collection={route.collection} /></WideBoard>;
  else if (route.page === "directory") content = <WideBoard><DirectoryPage kb={kb} folder={folder} /></WideBoard>;
  else if (route.page === "tools") content = <WideBoard><ToolsPage kb={kb} onSynced={setKb} /></WideBoard>;
  else if (route.page === "about") content = <WideBoard><AboutPage /></WideBoard>;
  else content = <WideBoard><HomePage kb={kb} pageNumber={route.pageNumber} /></WideBoard>;

  return <NavigationContext.Provider value={navigate}>
    <SiteHeader title={title} subtitle={subtitle} page={route.page} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} onSearch={() => setModal("search")} isShare={route.isShare} />
    <main id="main" tabIndex={-1}>{content}</main>
    <footer><div className="footer-inner"><div className="footer-content">{route.isShare ? <span>myBlog</span> : <SiteLink to="/">myBlog</SiteLink>}<span className="footer-heart">♡</span><span>Fluid</span></div></div></footer>
    {showTop && <button type="button" id="scroll-top-button" className="scroll-top" aria-label="返回顶部" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp size={19} /></button>}
    {modal === "search" && !route.isShare && !kb.isPrivate && <SearchDialog onClose={closeModal} />}
    {modal === "directory" && !route.isShare && !kb.isPrivate && <Modal title="知识目录" onClose={closeModal}><DirectoryTree tree={kb.tree} activeId={route.articleId} /></Modal>}
  </NavigationContext.Provider>;
}
