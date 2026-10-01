import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder } from "lucide-react";
import DirectoryTree from "../components/DirectoryTree.jsx";
import SiteLink from "../components/SiteLink.jsx";
import { articlePath, folderAncestors, folderPath } from "../../shared/navigation.js";
import { requestJson, shortDate } from "../lib/content.js";
import { renderArticle } from "../lib/markdown.js";

function FolderOverview({ overview }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    requestJson(`/api/article?id=${encodeURIComponent(overview.id)}`, { signal: controller.signal }).then(setData).catch(() => {});
    return () => controller.abort();
  }, [overview.id]);
  const rendered = useMemo(() => renderArticle(data?.content || "", data?.article.title || ""), [data]);
  return <div className="folder-overview">{data && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />}<SiteLink to={articlePath(overview.id)} className="overview-link">阅读目录介绍 →</SiteLink></div>;
}

export default function DirectoryPage({ kb, folder }) {
  if (!folder) return <><div className="page-heading"><h2>知识目录</h2><p>按文件夹浏览文章。</p></div><DirectoryTree tree={kb.tree} /></>;
  const children = folder.children.filter((child) => child.type === "folder");
  const articles = folder.children.filter((child) => child.type === "article");
  return <>
    <div className="folder-crumb"><SiteLink to="/directory">目录</SiteLink><ChevronRight size={12} />{folderAncestors(kb.tree, folder.path).map((ancestor, index, items) => <React.Fragment key={ancestor.path}>{index > 0 && <ChevronRight size={12} />}{index === items.length - 1 ? <span>{ancestor.name}</span> : <SiteLink to={folderPath(ancestor.path)}>{ancestor.name}</SiteLink>}</React.Fragment>)}</div>
    <div className="page-heading"><h2>{folder.name}</h2><p>{folder.articleCount} 篇公开文章</p></div>
    {folder.overview && <FolderOverview key={folder.overview.id} overview={folder.overview} />}
    {!!children.length && <section className="folder-section"><h3>子目录</h3>{children.map((child) => <SiteLink key={child.path} className="folder-row" to={folderPath(child.path)}><Folder size={20} /><span>{child.name}</span><small>{child.articleCount} 篇文章</small><ChevronRight size={13} className="row-next" /></SiteLink>)}</section>}
    {!!articles.length && <section className="folder-section"><h3>文章</h3>{articles.map((post) => <SiteLink key={post.id} className="folder-article" to={articlePath(post.id)}><span>{post.title}</span><time>{shortDate(kb.articles.find((item) => item.id === post.id)?.updatedAt)}</time></SiteLink>)}</section>}
    {!children.length && !articles.length && !folder.overview && <p className="muted">这个目录暂时没有公开文章。</p>}
  </>;
}
