/**
 * Flow 3 — Reviewer selects text → opens AI panel → submits compliance check →
 * AI response streams → confidence badge visible.
 *
 * Architecture §11.3 Flow 3
 */
import { expect, test } from "@playwright/test";
import { uploadDocument, waitForEpubReady } from "../fixtures/api.js";

const REVIEWER_TOKEN = () => process.env.TEST_REVIEWER_TOKEN ?? "";

test.describe("Flow 3 — AI compliance check streams and shows confidence badge", () => {
  test("compliance quick action streams response and renders confidence badge", async ({
    page,
  }) => {
    // 1. Set up document
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    // 2. Wait for the page to be fully loaded (viewer ready)
    await expect(
      page.locator('[data-testid="epub-viewer-main"]')
    ).toBeVisible({ timeout: 20_000 });

    // 3. Click the Compliance quick action button in the AI panel
    const complianceBtn = page.locator('[data-testid="quick-action-compliance"]');
    await expect(complianceBtn).toBeVisible({ timeout: 10_000 });
    await complianceBtn.click();

    // 4. The AI panel messages area should receive content (streaming started)
    const messagesArea = page.locator('[data-testid="ai-panel-messages"]');
    await expect(messagesArea).not.toBeEmpty({ timeout: 30_000 });

    // 5. Wait for the confidence badge to appear (signals streaming has completed
    //    and metadata was parsed)
    await expect(page.locator('[data-testid="confidence-badge"]')).toBeVisible({
      timeout: 30_000,
    });
  });

  test("AI panel accepts freeform text query and streams a response", async ({
    page,
  }) => {
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);
    await expect(
      page.locator('[data-testid="epub-viewer-main"]')
    ).toBeVisible({ timeout: 20_000 });

    // Type a query and submit
    const textarea = page.locator(
      "textarea[placeholder*='Ask the AI assistant']"
    );
    await textarea.fill("Summarise the main compliance risks in this document.");
    await page.keyboard.press("Enter");
    // Submit via Enter requires form submission — use the Send button instead
    await page.locator('button[type="submit"]').filter({ hasText: "Send" }).click();

    // Response must appear in the messages area within 30s
    const messagesArea = page.locator('[data-testid="ai-panel-messages"]');
    await expect(messagesArea).not.toBeEmpty({ timeout: 30_000 });
  });
});
