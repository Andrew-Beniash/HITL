/**
 * xlsx-edit BullMQ worker
 *
 * Picks up jobs from the 'xlsx-edit' queue, edits the target cell in the
 * source XLSX using an openpyxl subprocess, re-uploads the modified file as
 * a new source version, then enqueues an epub-conversion job.
 *
 * Run standalone:  pnpm worker:xlsx-edit
 */

import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { prisma } from "../prisma.js";
import {
  downloadToBuffer,
  uploadDocument,
  sourceKey,
} from "../s3.js";
import { enqueueConversionJob, type XlsxEditJobPayload } from "../queue.js";

const execFileAsync = promisify(execFile);

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// ── Column number → Excel letter (1-based) ────────────────────────────────────

function colToLetter(col: number): string {
  let letter = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ── Python cell-edit snippet ──────────────────────────────────────────────────

const PYTHON_SCRIPT = `
import openpyxl, sys, json
args = json.loads(sys.argv[1])
wb = openpyxl.load_workbook(args['path'])
ws = wb[args['sheet']]
ws[args['cellRef']] = args['value']
wb.save(args['path'])
`;

// ── Worker processor ──────────────────────────────────────────────────────────

async function processXlsxEdit(job: Job<XlsxEditJobPayload>): Promise<void> {
  const {
    documentId,
    tenantId,
    s3SourceKey,
    sheetName,
    row,
    col,
    value,
    newVersionId,
  } = job.data;

  // 1. Download current XLSX to a temp file
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hitl-xlsx-"));
  const tmpFile = path.join(tmpDir, "workbook.xlsx");

  try {
    const buffer = await downloadToBuffer(s3SourceKey);
    await fs.writeFile(tmpFile, buffer);

    // 2. Edit cell via Python + openpyxl
    const cellRef = `${colToLetter(col)}${row}`;
    const args = JSON.stringify({
      path: tmpFile,
      sheet: sheetName,
      cellRef,
      value,
    });

    await execFileAsync("python3", ["-c", PYTHON_SCRIPT, args]);

    // 3. Read modified file and upload as new source version
    const modified = await fs.readFile(tmpFile);

    // Determine the new version number from the DB version stub
    const versionRecord = await prisma.documentVersion.findUnique({
      where: { id: newVersionId },
    });

    if (!versionRecord) {
      throw new Error(`Version stub ${newVersionId} not found`);
    }

    const newKey = sourceKey(
      tenantId,
      documentId,
      versionRecord.versionNumber,
      "workbook.xlsx"
    );

    await uploadDocument(
      tenantId,
      documentId,
      versionRecord.versionNumber,
      "workbook.xlsx",
      modified,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // 4. Update the version stub with the real S3 key
    await prisma.documentVersion.update({
      where: { id: newVersionId },
      data: { sourceS3Key: newKey },
    });

    // 5. Enqueue EPUB conversion for the modified XLSX
    await enqueueConversionJob({
      documentId,
      versionId: newVersionId,
      s3SourceKey: newKey,
      sourceFormat: "xlsx",
      tenantId,
    });

    job.log(`Cell ${cellRef} updated in sheet "${sheetName}"; conversion enqueued.`);
  } finally {
    // Always clean up temp files
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Start worker ──────────────────────────────────────────────────────────────

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port ? parseInt(u.port, 10) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    maxRetriesPerRequest: null,
  };
}

const worker = new Worker<XlsxEditJobPayload>(
  "xlsx-edit",
  processXlsxEdit,
  { connection: parseRedisUrl(REDIS_URL), concurrency: 2 }
);

worker.on("completed", (job) => {
  console.log(`[xlsx-edit] job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[xlsx-edit] job ${job?.id} failed:`, err.message);
});

console.log("[xlsx-edit] worker started");
