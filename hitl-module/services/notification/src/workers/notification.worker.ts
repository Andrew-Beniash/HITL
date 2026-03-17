import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import Handlebars from "handlebars";
import { prisma } from "../prisma.js";
import { sendEmail } from "../email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, "../templates");

const USER_API_URL =
  process.env.USER_API_URL ?? "http://user-service:3008";
const APP_BASE_URL =
  process.env.APP_BASE_URL ?? "https://app.hitl.example.com";

// ── Subject template strings (Handlebars) ────────────────────────────────────

const SUBJECT_TEMPLATES: Record<string, string> = {
  mention: "{{mentionedBy}} mentioned you",
  review_request: "Review requested: {{documentTitle}}",
  critical_flag: "Action required: {{documentTitle}}",
  document_approved: "Document approved: {{documentTitle}}",
  document_rejected: "Document rejected: {{documentTitle}}",
};

// ── Template body cache ───────────────────────────────────────────────────────

const bodyTemplateCache = new Map<string, HandlebarsTemplateDelegate>();
const subjectTemplateCache = new Map<string, HandlebarsTemplateDelegate>();

function getBodyTemplate(type: string): HandlebarsTemplateDelegate {
  if (!bodyTemplateCache.has(type)) {
    const source = readFileSync(join(TEMPLATES_DIR, `${type}.hbs`), "utf-8");
    bodyTemplateCache.set(type, Handlebars.compile(source));
  }
  return bodyTemplateCache.get(type)!;
}

function getSubjectTemplate(type: string): HandlebarsTemplateDelegate {
  if (!subjectTemplateCache.has(type)) {
    const source =
      SUBJECT_TEMPLATES[type] ?? "Notification: {{documentTitle}}";
    subjectTemplateCache.set(type, Handlebars.compile(source));
  }
  return subjectTemplateCache.get(type)!;
}

// ── User resolution ───────────────────────────────────────────────────────────

interface ResolvedUser {
  id: string;
  email: string;
  displayName: string;
}

async function resolveUserById(userId: string): Promise<ResolvedUser> {
  const res = await fetch(`${USER_API_URL}/users/${userId}`);
  if (!res.ok) throw new Error(`User API error: ${res.status} for ${userId}`);
  return res.json() as Promise<ResolvedUser>;
}

async function resolveUserByUsername(username: string): Promise<ResolvedUser> {
  const res = await fetch(
    `${USER_API_URL}/users/by-username/${encodeURIComponent(username)}`
  );
  if (!res.ok)
    throw new Error(`User API error: ${res.status} for @${username}`);
  return res.json() as Promise<ResolvedUser>;
}

// ── Job data types ────────────────────────────────────────────────────────────

export interface MentionJobData {
  type: "mention";
  mentionerUserId: string;
  mentionedUsername: string;
  documentId: string;
  documentTitle?: string;
  annotationId?: string;
  commentExcerpt?: string;
  tenantId?: string;
}

export interface ReviewRequestJobData {
  type: "review_request";
  userId: string; // recipient
  requestedByUserId: string;
  documentId: string;
  documentTitle?: string;
  deadline?: string;
  instructions?: string;
  urgency?: string;
  tenantId?: string;
}

export interface CriticalFlagJobData {
  type: "critical_flag";
  userId: string; // recipient
  documentId: string;
  documentTitle?: string;
  urgency?: string;
  reason?: string;
  tenantId?: string;
}

export interface DocumentStatusJobData {
  type: "document_approved" | "document_rejected";
  userId: string; // recipient
  documentId: string;
  documentTitle?: string;
  actorUserId?: string;
  comment?: string;
  tenantId?: string;
}

export type NotificationJobData =
  | MentionJobData
  | ReviewRequestJobData
  | CriticalFlagJobData
  | DocumentStatusJobData;

// ── Core job processor (exported for unit-testing) ────────────────────────────

export async function processNotificationJob(
  job: Job<NotificationJobData>
): Promise<void> {
  const data = job.data;

  // 1. Resolve recipient user
  let recipient: ResolvedUser;
  let mentioner: ResolvedUser | null = null;
  let templateContext: Record<string, unknown> = {};

  if (data.type === "mention") {
    recipient = await resolveUserByUsername(data.mentionedUsername);
    mentioner = await resolveUserById(data.mentionerUserId);
    templateContext = {
      recipientName: recipient.displayName,
      mentionedBy: mentioner.displayName,
      documentTitle: data.documentTitle ?? data.documentId,
      commentExcerpt: data.commentExcerpt ?? "",
      reviewUrl: `${APP_BASE_URL}/documents/${data.documentId}`,
    };
  } else if (data.type === "review_request") {
    recipient = await resolveUserById(data.userId);
    const requester = await resolveUserById(data.requestedByUserId);
    templateContext = {
      recipientName: recipient.displayName,
      requestedBy: requester.displayName,
      documentTitle: data.documentTitle ?? data.documentId,
      deadline: data.deadline ?? "",
      instructions: data.instructions ?? "",
      urgency: data.urgency ?? "",
      reviewUrl: `${APP_BASE_URL}/documents/${data.documentId}`,
    };
  } else if (data.type === "critical_flag") {
    recipient = await resolveUserById(data.userId);
    templateContext = {
      recipientName: recipient.displayName,
      documentTitle: data.documentTitle ?? data.documentId,
      urgency: data.urgency ?? "high",
      reason: data.reason ?? "",
      reviewUrl: `${APP_BASE_URL}/documents/${data.documentId}`,
    };
  } else {
    // document_approved / document_rejected
    recipient = await resolveUserById(data.userId);
    const actor = data.actorUserId
      ? await resolveUserById(data.actorUserId)
      : null;
    const actorKey =
      data.type === "document_approved" ? "approvedBy" : "rejectedBy";
    templateContext = {
      recipientName: recipient.displayName,
      documentTitle: data.documentTitle ?? data.documentId,
      [actorKey]: actor?.displayName ?? "",
      comment: "comment" in data ? data.comment : "",
      reviewUrl: `${APP_BASE_URL}/documents/${data.documentId}`,
    };
  }

  // 2. Render subject and body
  const subjectTpl = getSubjectTemplate(data.type);
  const bodyTpl = getBodyTemplate(data.type);
  const subject = subjectTpl(templateContext);
  const htmlBody = bodyTpl(templateContext);

  // 3. Persist Notification row
  await prisma.notification.create({
    data: {
      tenantId:
        data.tenantId ?? "00000000-0000-0000-0000-000000000000",
      userId: recipient.id,
      type: data.type,
      payload: data as unknown as Record<string, unknown>,
      read: false,
    },
  });

  // 4. Send email (throws on SES failure → BullMQ retries)
  await sendEmail(recipient.email, subject, htmlBody);
}

// ── BullMQ Worker factory ─────────────────────────────────────────────────────

export function startNotificationWorker(connection: ConnectionOptions): Worker {
  const dlq = new Queue("notifications:failed", { connection });

  const worker = new Worker<NotificationJobData>(
    "notifications",
    processNotificationJob,
    {
      connection,
      concurrency: 5,
    }
  );

  // Move exhausted jobs (all retries spent) to DLQ
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      console.error(
        `[notification-worker] Job ${job.id} exhausted (${job.attemptsMade}/${maxAttempts}), moving to DLQ:`,
        err.message
      );
      await dlq
        .add(job.name, job.data, { removeOnComplete: false })
        .catch((e) => console.error("[notification-worker] DLQ add failed:", e));
    }
  });

  worker.on("error", (err) => {
    console.error("[notification-worker] Worker error:", err);
  });

  return worker;
}
