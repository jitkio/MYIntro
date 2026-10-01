import React, { createContext, useContext } from "react";
export const NavigationContext = createContext(null);

export default function SiteLink({ to, children, onClick, ...props }) {
  const navigate = useContext(NavigationContext);
  return <a href={to} {...props} onClick={(event) => {
    onClick?.(event);
    if (!navigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}
