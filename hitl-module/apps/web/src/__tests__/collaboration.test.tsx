import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SOCKET_EVENTS } from "@hitl/shared-types";
import type { PresenceUser } from "@hitl/shared-types";
import { useCollaboration } from "../hooks/useCollaboration.js";
import { PresenceAvatarStack } from "../components/Toolbar/PresenceAvatarStack.js";
import { useStore } from "../store/index.js";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockSocket } = vi.hoisted(() => {
  const mockSocket = {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return { mockSocket };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock("../lib/toast.js", () => ({
  showToast: vi.fn(),
  dismissToast: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Capture handlers registered via socket.on */
function captureHandlers(): Map<string, (...args: any[]) => any> {
  const map = new Map<string, (...args: any[]) => any>();
  mockSocket.on.mockImplementation(
    (event: string, handler: (...args: any[]) => any) => {
      map.set(event, handler);
    }
  );
  return map;
}

const BASE_STATE = {
  sessionId: "sess-1",
  documentId: "doc-1",
  tenantId: "tenant-1",
  currentUser: {
    id: "user-1",
    displayName: "Alice",
    email: "alice@example.com",
    avatarUrl: "",
  },
  authToken: "test-jwt",
  activeUsers: [],
  cursorPositions: {},
  annotations: [],
  focusedAnnotationId: null,
  filterState: { type: "all" as const, initiator: "all" as const, status: "all" as const },
  resolvedCount: 0,
  totalCriticalCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState(BASE_STATE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("useCollaboration — presence:update", () => {
  it("PRESENCE_UPDATE event populates Zustand activeUsers", async () => {
    const handlers = captureHandlers();

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: null,
      })
    );

    const users: PresenceUser[] = [
      {
        userId: "user-2",
        displayName: "Bob",
        avatarUrl: "https://example.com/bob.png",
        currentCfi: "epubcfi(/6/4)",
        lastSeenAt: new Date().toISOString(),
      },
    ];

    await act(async () => {
      handlers.get(SOCKET_EVENTS.PRESENCE_UPDATE)?.(users);
    });

    expect(useStore.getState().activeUsers).toEqual(users);
  });

  it("emits PRESENCE_JOIN on mount with user details", () => {
    captureHandlers();

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: null,
      })
    );

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.PRESENCE_JOIN,
      expect.objectContaining({
        sessionId: "sess-1",
        userId: "user-1",
        displayName: "Alice",
      })
    );
  });
});

describe("useCollaboration — epub:updated", () => {
  it("fetches fresh signed URL, reopens book, and restores CFI", async () => {
    const handlers = captureHandlers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ signedUrl: "https://s3.example.com/new.epub" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const mockBook = { open: vi.fn().mockResolvedValue(undefined) };
    const mockRendition = {
      on: vi.fn(),
      off: vi.fn(),
      currentLocation: vi.fn(() => ({ start: { cfi: "epubcfi(/6/2)" } })),
      book: mockBook,
      display: vi.fn(),
    };

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: mockRendition,
      })
    );

    await act(async () => {
      await handlers.get(SOCKET_EVENTS.EPUB_UPDATED)?.({
        documentId: "doc-1",
        epubS3Key: "tenant-1/doc-1/v2.epub",
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/epub");
      expect(mockBook.open).toHaveBeenCalledWith(
        "https://s3.example.com/new.epub"
      );
      expect(mockRendition.display).toHaveBeenCalledWith("epubcfi(/6/2)");
    });
  });

  it("ignores epub:updated for a different documentId", async () => {
    const handlers = captureHandlers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: null,
      })
    );

    await act(async () => {
      await handlers.get(SOCKET_EVENTS.EPUB_UPDATED)?.({
        documentId: "doc-OTHER",
        epubS3Key: "key",
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useCollaboration — cursor throttle", () => {
  it("10 relocated events in 40ms result in ≤ 2 CURSOR_UPDATE emits", () => {
    vi.useFakeTimers();

    captureHandlers();

    const renditionHandlers = new Map<string, (...args: any[]) => any>();
    const mockRendition = {
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        renditionHandlers.set(event, handler);
      }),
      off: vi.fn(),
      currentLocation: vi.fn(() => null),
    };

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: mockRendition,
      })
    );

    const handleRelocated = renditionHandlers.get("relocated");
    expect(handleRelocated).toBeDefined();

    // Fire 10 events 4 ms apart (total window = 40 ms)
    for (let i = 0; i < 10; i++) {
      handleRelocated?.({ start: { cfi: `epubcfi(/6/${i * 2})` } });
      vi.advanceTimersByTime(4);
    }

    const cursorEmits = mockSocket.emit.mock.calls.filter(
      ([event]) => event === SOCKET_EVENTS.CURSOR_UPDATE
    );
    expect(cursorEmits.length).toBeLessThanOrEqual(2);

    vi.useRealTimers();
  });
});

describe("useCollaboration — disconnect toast", () => {
  it("disconnect event triggers showToast with 'warning'", async () => {
    const { showToast } = await import("../lib/toast.js");
    const handlers = captureHandlers();

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: null,
      })
    );

    await act(async () => {
      handlers.get("disconnect")?.("transport close");
    });

    expect(showToast).toHaveBeenCalledWith(expect.any(String), "warning");
  });

  it("connect event triggers dismissToast (reconnect path)", async () => {
    const { dismissToast } = await import("../lib/toast.js");
    const handlers = captureHandlers();

    renderHook(() =>
      useCollaboration({
        sessionId: "sess-1",
        documentId: "doc-1",
        rendition: null,
      })
    );

    await act(async () => {
      handlers.get("connect")?.();
    });

    expect(dismissToast).toHaveBeenCalled();
  });
});

describe("PresenceAvatarStack", () => {
  it("renders avatar buttons for each active user", () => {
    useStore.setState({
      ...BASE_STATE,
      activeUsers: [
        {
          userId: "user-1",
          displayName: "Alice",
          avatarUrl: "",
          currentCfi: "epubcfi(/6/2)",
          lastSeenAt: new Date().toISOString(),
        },
        {
          userId: "user-2",
          displayName: "Bob",
          avatarUrl: "https://example.com/bob.png",
          currentCfi: "epubcfi(/6/4)",
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });

    render(<PresenceAvatarStack rendition={null} />);

    expect(
      screen.getByRole("button", { name: "Go to Alice's position" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to Bob's position" })
    ).toBeInTheDocument();
  });

  it("clicking another user's avatar calls rendition.display with their CFI", async () => {
    useStore.setState({
      ...BASE_STATE,
      activeUsers: [
        {
          userId: "user-2",
          displayName: "Bob",
          avatarUrl: "",
          currentCfi: "epubcfi(/6/8)",
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });

    const mockRendition = { display: vi.fn() };
    render(<PresenceAvatarStack rendition={mockRendition} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Go to Bob's position" })
    );

    expect(mockRendition.display).toHaveBeenCalledWith("epubcfi(/6/8)");
  });

  it("shows '+N more' overflow badge when more than 5 users are present", () => {
    useStore.setState({
      ...BASE_STATE,
      activeUsers: Array.from({ length: 7 }, (_, i) => ({
        userId: `user-${i + 1}`,
        displayName: `User ${i + 1}`,
        avatarUrl: "",
        currentCfi: `epubcfi(/6/${i * 2})`,
        lastSeenAt: new Date().toISOString(),
      })),
    });

    render(<PresenceAvatarStack rendition={null} />);

    expect(screen.getByLabelText("2 more collaborators")).toBeInTheDocument();
  });
});
