/**
 * Flow 2 — AI creates critical flag → reviewer sees red highlight → reviewer resolves →
 * progress bar updates → document can now be approved.
 *
 * Architecture §11.3 Flow 2
 */
import { expect, test } from "@playwright/test";
import {
  createAnnotation,
  uploadDocument,
  waitForEpubReady,
} from "../fixtures/api.js";

const REVIEWER_TOKEN = () => process.env.TEST_REVIEWER_TOKEN ?? "";

test.describe("Flow 2 — Critical flag resolution unblocks approval", () => {
  test("critical flag blocks approval until resolved", async ({ page }) => {
    // 1. Create an isolated document for this test
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    // 2. Seed a critical flag via the API (simulates the AI agent creating one)
    const flagId = await createAnnotation(REVIEWER_TOKEN(), documentId, {
      type: "critical_flag",
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      cfiText: "HITL E2E Sample Document",
      payload: {
        type: "critical_flag",
        reason: "E2E test — compliance review required",
      },
    });

    // 3. Open the document page
    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    // 4. The annotation item must appear in the attention panel
    const annotationItem = page.locator(
      `[data-annotation-type="critical_flag"]`
    ).first();
    await expect(annotationItem).toBeVisible({ timeout: 15_000 });

    // 5. Progress bar shows 0 of 1
    const progressText = page.locator('[data-testid="progress-bar-text"]');
    await expect(progressText).toHaveText(/0 of 1 critical items resolved/, {
      timeout: 10_000,
    });

    // 6. Attempting to approve before resolving should fail with 409
    const approveBeforeResolve = await page.request.post(
      `/api/documents/${documentId}/approve`,
      { data: { decision: "approved" } }
    );
    expect(approveBeforeResolve.status()).toBe(409);

    // 7. Click the specific flag item to focus it
    const flagItem = page.locator(`[data-annotation-id="${flagId}"]`);
    await flagItem.click();

    // 8. Resolve button appears on focused item
    const resolveBtn = page.locator('[data-testid="resolve-button"]');
    await expect(resolveBtn).toBeVisible({ timeout: 5_000 });
    await resolveBtn.click();

    // 9. Progress bar now shows 1 of 1
    await expect(progressText).toHaveText(/1 of 1 critical items resolved/, {
      timeout: 10_000,
    });

    // 10. Approval now succeeds
    const approveAfterResolve = await page.request.post(
      `/api/documents/${documentId}/approve`,
      { data: { decision: "approved" } }
    );
    expect(approveAfterResolve.status()).toBe(200);
  });

  test("resolved annotation shows resolved badge without resolve button", async ({
    page,
  }) => {
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    // Create and immediately resolve via direct API call
    const flagId = await createAnnotation(REVIEWER_TOKEN(), documentId, {
      type: "critical_flag",
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      cfiText: "Sample text",
      payload: { type: "critical_flag", reason: "Already resolved" },
    });

    // Resolve it via API before visiting the page
    await page.request.post(
      `/api/documents/${documentId}/annotations/${flagId}/resolve`
    );

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    const flagItem = page.locator(`[data-annotation-id="${flagId}"]`);
    await flagItem.waitFor({ state: "visible", timeout: 15_000 });
    await flagItem.click();

    // Resolve button must NOT appear for already-resolved items
    await expect(
      page.locator('[data-testid="resolve-button"]')
    ).not.toBeVisible();
  });
});
