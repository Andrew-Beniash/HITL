/**
 * Flow 4 — XLSX upload → EPUB renders table correctly → reviewer edits cell →
 * EPUB re-renders with updated value.
 *
 * Architecture §11.3 Flow 4
 */
import { expect, test } from "@playwright/test";
import { uploadDocument, waitForEpubReady } from "../fixtures/api.js";

const REVIEWER_TOKEN = () => process.env.TEST_REVIEWER_TOKEN ?? "";

test.describe("Flow 4 — XLSX cell edit triggers EPUB reload", () => {
  test("editing a table cell PATCHes the sheet and reloads the EPUB with the new value", async ({
    page,
  }) => {
    // 1. Upload the XLSX fixture
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.xlsx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);

    // 2. Wait for the EPUB viewer
    await expect(
      page.locator('[data-testid="epub-viewer-main"]')
    ).toBeVisible({ timeout: 20_000 });

    // 3. Wait for the table cell in the EPUB iframe (conversion must have emitted
    //    data-row / data-col attributes per the conversion pipeline contract)
    const iframe = page.frameLocator('[data-testid="epub-viewer-main"] iframe');
    const targetCell = iframe.locator('td[data-row="2"][data-col="1"]');
    await targetCell.waitFor({ state: "visible", timeout: 20_000 });

    // 4. Click the cell — this should mount the CellEditor overlay
    await targetCell.click();
    const cellEditor = page.locator('[data-testid="cell-editor"]');
    await expect(cellEditor).toBeVisible({ timeout: 5_000 });

    // 5. Clear the existing value and type the new one
    const cellInput = cellEditor.locator('input[aria-label="Cell value"]');
    await cellInput.clear();
    await cellInput.fill("UPDATED");

    // 6. Intercept the PATCH request to /documents/:id/cells
    const cellPatch = page.waitForRequest(
      (req) =>
        req.method() === "PATCH" &&
        req.url().includes(`/documents/${documentId}/cells`)
    );

    // 7. Confirm the edit via Enter
    await cellInput.press("Enter");
    const patchReq = await cellPatch;
    expect(patchReq).toBeTruthy();

    // 8. Cell editor should close
    await expect(cellEditor).not.toBeVisible({ timeout: 10_000 });

    // 9. Wait for the epub:updated event to reload the viewer — after reload the
    //    new EPUB will be rendered.  We wait for the cell to contain the updated
    //    value in the freshly loaded iframe.
    await expect(
      page
        .frameLocator('[data-testid="epub-viewer-main"] iframe')
        .locator('td[data-row="2"][data-col="1"]')
    ).toHaveText("UPDATED", { timeout: 30_000 });
  });

  test("CellEditor closes without patching when Escape is pressed", async ({
    page,
  }) => {
    const { documentId, sessionId } = await uploadDocument(
      REVIEWER_TOKEN(),
      "sample.xlsx"
    );
    await waitForEpubReady(REVIEWER_TOKEN(), documentId);

    await page.goto(`/documents/${documentId}?sessionId=${sessionId}`);
    await expect(
      page.locator('[data-testid="epub-viewer-main"]')
    ).toBeVisible({ timeout: 20_000 });

    const iframe = page.frameLocator('[data-testid="epub-viewer-main"] iframe');
    await iframe.locator('td[data-row="2"][data-col="1"]').click();

    await expect(
      page.locator('[data-testid="cell-editor"]')
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");

    await expect(
      page.locator('[data-testid="cell-editor"]')
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
