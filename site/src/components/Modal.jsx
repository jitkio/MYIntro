import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const close = () => onClose();
    dialog.addEventListener("close", close);
    return () => { dialog.removeEventListener("close", close); dialog.close(); };
  }, [onClose]);
  return <dialog ref={ref} className={`preview-dialog ${className}`} aria-labelledby="modal-title" onClick={(event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose();
  }}>
    <div className="dialog-header"><h2 id="modal-title">{title}</h2><button type="button" className="quiet-button" aria-label="关闭弹窗" onClick={onClose}><X size={20} /></button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
