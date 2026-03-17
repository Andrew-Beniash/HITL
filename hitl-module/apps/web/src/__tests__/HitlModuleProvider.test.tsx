import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HitlModuleProvider } from "../providers/HitlModuleProvider.js";
import { useStore } from "../store/index.js";

vi.mock("../lib/fonts.js", () => ({
  preloadFonts: vi.fn().mockResolvedValue(undefined),
}));

const config = {
  sessionId: "sess-1",
  documentId: "doc-1",
  tenantId: "tenant-1",
  authToken: "token-123",
  apiBase: "http://localhost",
};

function successFetchImpl(url: string): Promise<Response> {
  const make = (body: unknown) =>
    Promise.resolve({
      ok: true,
      json: async () => body,
    } as Response);

  if (url.includes("/sessions/")) {
    return make({
      user: { id: "user-1", displayName: "Alice", email: "alice@example.com" },
    });
  }
  if (url.includes("/permissions")) {
    return make({ permissions: ["read:document", "create:annotation"] });
  }
  if (url.includes("/versions")) {
    return make({
      versions: [
        {
          id: "v1",
          conversionManifest: null,
          epubSignedUrl: "/epub/v1",
        },
      ],
    });
  }
  if (url.includes("/annotations")) {
    return make({ annotations: [] });
  }
  if (url.includes("/documents/")) {
    return make({ id: "doc-1", sourceFormat: "docx", currentVersionId: "v1" });
  }
  if (url.includes("/font-profiles/active")) {
    return make(null);
  }
  return make({});
}

describe("HitlModuleProvider", () => {
  beforeEach(() => {
    useStore.setState({
      sessionId: null,
      documentId: null,
      tenantId: null,
      currentUser: null,
      permissions: [],
      reviewState: null,
      fontsLoaded: false,
      fontProfile: null,
      fontLoadError: null,
      annotations: [],
      focusedAnnotationId: null,
      filterState: {
        type: "all",
        initiator: "all",
        status: "all",
      },
      resolvedCount: 0,
      totalCriticalCount: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders BootstrapLoader before bootstrap completes", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(
      <HitlModuleProvider config={config}>
        <div data-testid="children">App Content</div>
      </HitlModuleProvider>
    );

    expect(screen.getByTestId("bootstrap-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("renders children after successful bootstrap", async () => {
    vi.stubGlobal("fetch", vi.fn(successFetchImpl));

    render(
      <HitlModuleProvider config={config}>
        <div data-testid="children">App Content</div>
      </HitlModuleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
  });

  it("shows error UI when bootstrap fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    render(
      <HitlModuleProvider config={config}>
        <div data-testid="children">App Content</div>
      </HitlModuleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("bootstrap-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("retries bootstrap when Retry button is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("First attempt fails"))
      .mockImplementation(successFetchImpl);

    vi.stubGlobal("fetch", fetchMock);

    render(
      <HitlModuleProvider config={config}>
        <div data-testid="children">App Content</div>
      </HitlModuleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("bootstrap-error")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
  });
});
