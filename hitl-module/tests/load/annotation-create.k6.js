/**
 * k6 load test — annotation create endpoint
 *
 * NFR target (§6 / §10): P95 annotation create < 500ms, error rate < 1%
 *
 * Run locally:
 *   k6 run \
 *     -e TEST_TOKEN=<jwt> \
 *     -e TEST_DOCUMENT_ID=<uuid> \
 *     -e SESSION_ID=<uuid> \
 *     -e VERSION_ID=<uuid> \
 *     -e API_URL=http://localhost:3001 \
 *     tests/load/annotation-create.k6.js
 *
 * CI (docker-compose stack):
 *   API_URL=$E2E_API_URL k6 run ... tests/load/annotation-create.k6.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────────

const annotationErrors = new Counter("annotation_errors");
const annotationDuration = new Trend("annotation_duration_ms", true);
const annotationSuccessRate = new Rate("annotation_success_rate");

// ── Test options ──────────────────────────────────────────────────────────────

export const options = {
  vus: 200,
  duration: "60s",
  thresholds: {
    // P95 latency must be under 500ms (NFR §6)
    "http_req_duration{name:annotation_create}": ["p(95)<500"],
    // Error rate must stay below 1%
    http_req_failed: ["rate<0.01"],
    // Custom metric: all requests succeed
    annotation_success_rate: ["rate>0.99"],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAnnotationPayload(docId, sessionId, versionId) {
  return JSON.stringify({
    type: "human_comment",
    cfi: "epubcfi(/6/4!/4/2/1:0)",
    cfiText: "Load test annotation",
    payload: {
      type: "human_comment",
      body: `Load test comment — VU ${__VU} iteration ${__ITER}`,
      mentions: [],
    },
    sessionId,
    documentVersionId: versionId,
  });
}

// ── Default function (executed once per VU per iteration) ─────────────────────

export default function () {
  const token = __ENV.TEST_TOKEN;
  const docId = __ENV.TEST_DOCUMENT_ID;
  const sessionId = __ENV.SESSION_ID;
  const versionId = __ENV.VERSION_ID;
  const apiUrl = __ENV.API_URL ?? "http://localhost:3001";

  const url = `${apiUrl}/api/documents/${docId}/annotations`;
  const body = buildAnnotationPayload(docId, sessionId, versionId);
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    tags: { name: "annotation_create" },
  };

  const res = http.post(url, body, params);

  const ok = check(res, {
    "status is 201": (r) => r.status === 201,
    "response has id": (r) => {
      try {
        return Boolean(JSON.parse(r.body).id);
      } catch {
        return false;
      }
    },
  });

  annotationSuccessRate.add(ok);
  annotationDuration.add(res.timings.duration);

  if (!ok) {
    annotationErrors.add(1);
    console.error(
      `annotation_create failed: status=${res.status} body=${res.body?.slice(0, 200)}`
    );
  }

  // 100ms think time between requests per VU
  sleep(0.1);
}

// ── Setup: verify target document is accessible before ramping up ─────────────

export function setup() {
  const token = __ENV.TEST_TOKEN;
  const docId = __ENV.TEST_DOCUMENT_ID;
  const apiUrl = __ENV.API_URL ?? "http://localhost:3001";

  const res = http.get(`${apiUrl}/api/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status !== 200) {
    throw new Error(
      `Setup check failed: GET /documents/${docId} returned ${res.status}. ` +
        "Ensure TEST_DOCUMENT_ID points to an existing, converted document."
    );
  }
}
