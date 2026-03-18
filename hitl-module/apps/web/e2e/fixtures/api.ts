import fs from "fs";
import path from "path";

const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3001";

async function apiFetch(
  token: string,
  pathname: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  return res;
}

/** Upload a document file and return its documentId. */
export async function uploadDocument(
  token: string,
  filePath: string
): Promise<{ documentId: string; sessionId: string }> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve("e2e/fixtures", filePath);

  const form = new FormData();
  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(filePath).slice(1);
  const mimeTypes: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
    md: "text/markdown",
    epub: "application/epub+zip",
  };
  form.append(
    "file",
    new Blob([buffer], { type: mimeTypes[ext] ?? "application/octet-stream" }),
    path.basename(filePath)
  );

  const res = await apiFetch(token, "/api/documents", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`uploadDocument failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<{ documentId: string; sessionId: string }>;
}

/** Poll until EPUB conversion is complete and return the EPUB URL. */
export async function waitForEpubReady(
  token: string,
  documentId: string,
  maxWaitMs = 30_000
): Promise<string> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await apiFetch(token, `/api/documents/${documentId}`);
    if (!res.ok) throw new Error(`waitForEpubReady: GET failed ${res.status}`);

    const doc = (await res.json()) as {
      conversionStatus: string;
      epubUrl: string | null;
    };

    if (doc.conversionStatus === "complete" && doc.epubUrl) {
      return doc.epubUrl;
    }
    if (doc.conversionStatus === "failed") {
      throw new Error(`EPUB conversion failed for document ${documentId}`);
    }

    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(
    `waitForEpubReady: timed out after ${maxWaitMs}ms for document ${documentId}`
  );
}

/** Create an annotation via the API and return the annotation ID. */
export async function createAnnotation(
  token: string,
  documentId: string,
  annotation: {
    type: string;
    cfi: string;
    cfiText?: string;
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const res = await apiFetch(token, `/api/documents/${documentId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
  });

  if (!res.ok) {
    throw new Error(`createAnnotation failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Activate a font profile by ID (admin action). */
export async function activateFontProfile(
  token: string,
  profileId: string
): Promise<void> {
  const res = await apiFetch(token, `/api/config/font-profile/${profileId}/activate`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `activateFontProfile failed: ${res.status} ${await res.text()}`
    );
  }
}

/** List all font profiles (admin action). */
export async function listFontProfiles(
  token: string
): Promise<Array<{ id: string; name: string; isActive: boolean }>> {
  const res = await apiFetch(token, "/api/config/font-profiles");
  if (!res.ok) {
    throw new Error(`listFontProfiles failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
