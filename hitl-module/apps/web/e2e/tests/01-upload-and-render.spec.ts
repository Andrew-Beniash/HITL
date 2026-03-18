/**
 * Flow 1 — Upload DOCX → wait for EPUB render → verify first chapter visible with correct fonts.
 *
 * Architecture §11.3 Flow 1:
 *   Upload DOCX → wait for EPUB render → verify first chapter is visible with correct fonts
 */
import { expect, test } from "@playwright/test";
import { uploadDocument, waitForEpubReady } from "../fixtures/api.js";

const REVIEWER_TOKEN = () => process.env.TEST_REVIEWER_TOKEN ?? "";

test.describe("Flow 1 — Upload DOCX and render with correct fonts", () => {
  test("DOCX upload converts to EPUB and renders with the configured font family", async ({
    page,
  }) => {
    // 1. Upload document and wait for EPUB conversion
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    // 2. Navigate to the document workspace
    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    // 3. The EPUB viewer iframe must appear
    const viewer = page.locator('[data-testid="epub-viewer-main"]');
    await expect(viewer).toBeVisible({ timeout: 20_000 });

    const iframe = page.frameLocator('[data-testid="epub-viewer-main"] iframe');

    // 4. Wait for body to exist inside the iframe (epub.js injects content)
    await iframe.locator("body").waitFor({ state: "visible", timeout: 20_000 });

    // 5. Verify that the platform font family (Inter) is applied to the body
    const fontFamily = await iframe.locator("body").evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    );
    expect(fontFamily.toLowerCase()).toContain("inter");
  });

  test("Bootstrap loader disappears once the EPUB is ready", async ({ page }) => {
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.docx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    // Bootstrap loader should not be visible after full load
    await expect(page.locator('[data-testid="bootstrap-loader"]')).not.toBeVisible({
      timeout: 20_000,
    });

    // The viewer should be visible
    await expect(
      page.locator('[data-testid="epub-viewer-main"]')
    ).toBeVisible();
  });
});
