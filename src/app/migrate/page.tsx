"use client";

import { useCallback, useState } from "react";
import { type SavedDocument, saveDocument } from "@/lib/storage";

export default function MigratePage() {
  const [status, setStatus] = useState<string>("");
  const [done, setDone] = useState(false);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        setStatus("Reading file...");
        const text = await file.text();
        const docs: SavedDocument[] = JSON.parse(text);
        if (!Array.isArray(docs) || docs.length === 0) {
          setStatus("No documents found in file.");
          return;
        }
        setStatus(`Importing ${docs.length} document(s)...`);
        for (const doc of docs) {
          if (doc.id && doc.markdown) {
            await saveDocument(doc);
          }
        }
        setStatus(`Imported ${docs.length} document(s). Go back to /`);
        setDone(true);
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : err}`);
      }
    },
    []
  );

  return (
    <div
      style={{
        background: "#111",
        color: "#eee",
        fontFamily: "system-ui",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2>Import ResumeWise Documents</h2>
        <p style={{ color: "#aaa", marginBottom: 24 }}>
          Upload the exported JSON file
        </p>
        <input
          type="file"
          accept=".json"
          onChange={handleFile}
          style={{ marginBottom: 16 }}
        />
        {status && <p style={{ marginTop: 16 }}>{status}</p>}
        {done && (
          <a href="/" style={{ color: "#4af", marginTop: 8, display: "block" }}>
            Open ResumeWise
          </a>
        )}
      </div>
    </div>
  );
}
