import React from "react";
import type { ModelInfo } from "../api.js";

export function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 280 }}>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} — {m.family}
        </option>
      ))}
    </select>
  );
}
