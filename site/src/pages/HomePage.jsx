import React from "react";
import { ChevronRight, Clock, Folder } from "lucide-react";
import SiteLink from "../components/SiteLink.jsx";
import { articleFolder, articlePath, folderPath } from "../../shared/navigation.js";
import { shortDate, sortedArticles } from "../lib/content.js";

export default function HomePage({ kb, pageNumber }) {
  const articles = sortedArticles(kb.articles);
  const pageCount = Math.max(1, Math.ceil(articles.length / 6));
  const page = Math.min(pageNumber || 1, pageCount);
  const pages = [...new Set([1, ...Array.from({ length: 5 }, (_, index) => page + index - 2).filter((number) => number > 1 && number < pageCount), pageCount])].sort((a, b) => a - b);
  return <>
    {articles.slice((page - 1) * 6, page * 6).map((post) => {
      const folder = articleFolder(kb.tree, post.id);
      return <article key={post.id} className="index-card">
        <SiteLink className="index-header" to={articlePath(post.id)}>{post.title}</SiteLink>
        {post.summary && <div className="index-excerpt index-excerpt__noimg"><div>{post.summary}</div></div>}
        <div className="index-btm">{post.updatedAt && <span><Clock size={13} />{shortDate(post.updatedAt)}</span>}{folder?.path && <SiteLink className="index-folder" to={folderPath(folder.path)}><Folder size={13} />{folder.name}</SiteLink>}</div>
      </article>;
    })}
    {!articles.length && <p className="muted">暂无公开文章。</p>}
    {pageCount > 1 && <nav className="pagination-simple" aria-label="文章分页">{pages.map((number, index) => <React.Fragment key={number}>{index > 0 && number - pages[index - 1] > 1 && <span>…</span>}<SiteLink to={number === 1 ? "/" : `/?page=${number}`} className={page === number ? "current" : ""} aria-current={page === number ? "page" : undefined}>{number}</SiteLink></React.Fragment>)}{page < pageCount && <SiteLink to={`/?page=${page + 1}`} aria-label="下一页"><ChevronRight size={15} /></SiteLink>}</nav>}
  </>;
}
