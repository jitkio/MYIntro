import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, List } from "lucide-react";
import SiteLink from "../components/SiteLink.jsx";
import { articleFolder, articlePath, folderAncestors, folderPath } from "../../shared/navigation.js";
import { shortDate, sortedArticles } from "../lib/content.js";
import { renderArticle } from "../lib/markdown.js";

function TableOfContents({ headings, active }) {
  const base = Math.min(...headings.map((heading) => heading.level));
  return <ol className="toc-list">{headings.map((heading) => <li key={heading.id} style={{ paddingLeft: `${Math.min(heading.level - base, 3) * .85}rem` }}><a className={heading.id === active ? "active" : ""} aria-current={heading.id === active ? "location" : undefined} href={`#${encodeURIComponent(heading.id)}`} onClick={(event) => {
    event.preventDefault();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(heading.id)}`);
    document.getElementById(heading.id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }}>{heading.text}</a></li>)}</ol>;
}

export default function ArticlePage({ article, content, kb, onDirectory }) {
  const { html, headings, empty } = useMemo(() => renderArticle(content, article.title), [content, article.title]);
  const [activeHeading, setActiveHeading] = useState(headings[0]?.id);
  const [copied, setCopied] = useState(false);
  const folder = articleFolder(kb.tree, article.id);
  const articles = sortedArticles(kb.articles);
  const currentIndex = articles.findIndex((item) => item.id === article.id);
  const previous = articles[currentIndex - 1];
  const next = articles[currentIndex + 1];
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const current = [...headings].reverse().find((heading) => (document.getElementById(heading.id)?.getBoundingClientRect().top ?? Infinity) <= 140) || headings[0];
        setActiveHeading(current?.id);
        frame = 0;
      });
    };
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { id = ""; }
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => { window.removeEventListener("scroll", update); window.cancelAnimationFrame(frame); };
  }, [html]);
  return <div className="container-fluid nopadding-x"><div className="row nomargin-x">
    <div className="side-col d-none d-lg-block col-lg-2" />
    <div className="col-lg-8 nopadding-x-md reader-board"><div className="container nopadding-x-md" id="board-ctn"><div id="board"><article className="post-content mx-auto">
      <div className="reading-breadcrumb"><SiteLink to="/directory">目录</SiteLink>{folder?.path && <><ChevronRight size={11} />{folderAncestors(kb.tree, folder.path).map((ancestor, index) => <React.Fragment key={ancestor.path}>{index > 0 && <ChevronRight size={11} />}<SiteLink to={folderPath(ancestor.path)}>{ancestor.name}</SiteLink></React.Fragment>)}</>}<button type="button" className="quiet-button" onClick={onDirectory}><List size={13} />全部目录</button></div>
      {article.updatedAt && <p className="note note-info">本文最后更新于 {shortDate(article.updatedAt).replaceAll("-", "/")}</p>}
      {!!headings.length && <details className="mobile-toc"><summary>文章目录</summary><TableOfContents headings={headings} active={activeHeading} /></details>}
      {empty ? <p className="muted">这篇笔记还没有正文。</p> : <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />}
      <div className="article-bottom"><button type="button" className="quiet-button copy-link" aria-label="复制文章链接" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "已复制链接" : "复制链接"}</button>
        {(previous || next) && <nav className="post-prevnext" aria-label="文章导航">{previous ? <SiteLink to={articlePath(previous.id)}><ArrowLeft size={18} /><span>{previous.title}</span></SiteLink> : <span className="navigation-spacer" />}{next && <SiteLink to={articlePath(next.id)}><span>{next.title}</span><ArrowRight size={18} /></SiteLink>}</nav>}
      </div>
    </article></div></div></div>
    <div className="side-col d-none d-lg-block col-lg-2 reader-side">{!!headings.length && <aside className="sidebar"><div id="toc"><p className="toc-header"><List size={20} />目录</p><div className="toc-body"><TableOfContents headings={headings} active={activeHeading} /></div></div></aside>}</div>
  </div></div>;
}
