import React, { useEffect, useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { articlePath, folderPath } from "../../shared/navigation.js";
import SiteLink from "./SiteLink.jsx";

function containsArticle(node, id) {
  return Boolean(id && (node.id === id || node.overview?.id === id || node.children?.some((child) => containsArticle(child, id))));
}
function TreeNode({ node, activeId, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 1 || containsArticle(node, activeId));
  const active = containsArticle(node, activeId);
  useEffect(() => { if (active) setExpanded(true); }, [active]);
  if (node.type === "article") return <SiteLink to={articlePath(node.id)} className={`tree-article ${node.id === activeId ? "is-current" : ""}`} aria-current={node.id === activeId ? "page" : undefined}><FileText size={15} /><span>{node.title}</span></SiteLink>;
  if (node.type === "root") return <>{node.children?.map((child) => <TreeNode key={child.path || child.id} node={child} activeId={activeId} depth={depth} />)}</>;
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><ChevronRight size={13} className="tree-chevron" /><Folder size={16} className="folder-icon" /><SiteLink to={folderPath(node.path)} onClick={(event) => event.stopPropagation()}>{node.name}</SiteLink><small className="tree-count">{node.articleCount}</small></summary>
    <div className="tree-children">
      {node.overview && <SiteLink to={articlePath(node.overview.id)} className={`tree-article ${node.overview.id === activeId ? "is-current" : ""}`}><FileText size={15} /><span>目录介绍</span></SiteLink>}
      {node.children?.map((child) => <TreeNode key={child.path || child.id} node={child} activeId={activeId} depth={depth + 1} />)}
      {!node.children?.length && !node.overview && <p className="muted tree-empty">暂无公开文章</p>}
    </div>
  </details>;
}
export default function DirectoryTree({ tree, activeId }) {
  return <div className="folder-tree"><TreeNode node={tree} activeId={activeId} /></div>;
}
