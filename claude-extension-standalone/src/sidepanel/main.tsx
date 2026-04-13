import React from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "./SidePanel.js";

const mountNode = document.getElementById("root");
if (!mountNode) {
  document.body.innerHTML = '<div style="padding:12px;color:#e6e9f2;background:#0f1115;font-family:sans-serif">Claude side panel failed to find #root</div>';
} else {
  try {
    createRoot(mountNode).render(<SidePanel />);
  } catch (err) {
    mountNode.innerHTML = `<div style="padding:12px;color:#ffb4b4;font-family:sans-serif">Claude side panel crashed: ${(err as Error).message}</div>`;
  }
}
