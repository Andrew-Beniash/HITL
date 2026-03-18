import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useStore } from "../store/index.js";
import { preloadFonts } from "../lib/fonts.js";
import { BootstrapLoader } from "../components/BootstrapLoader.js";
import type { FontProfile } from "@hitl/shared-types";

export interface HitlModuleConfig {
  sessionId: string;
  documentId: string;
  tenantId: string;
  authToken: string;
  apiBase?: string;
}

interface HitlModuleProviderProps {
  config: HitlModuleConfig;
  children: ReactNode;
}

export const BOOTSTRAP_STEPS = [
  "Validating session",
  "Resolving permissions",
  "Loading document metadata",
  "Fetching version history",
  "Resolving EPUB URL",
  "Loading font profile",
  "Preloading fonts",
  "Connecting to collaboration",
  "Syncing annotations",
] as const;

export function HitlModuleProvider({
  config,
  children,
}: HitlModuleProviderProps) {
  const [bootstrapStep, setBootstrapStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const setSession = useStore((s) => s.setSession);
  const setAuthToken = useStore((s) => s.setAuthToken);
  const setPermissions = useStore((s) => s.setPermissions);
  const setDocument = useStore((s) => s.setDocument);
  const setVersionHistory = useStore((s) => s.setVersionHistory);
  const setFontProfile = useStore((s) => s.setFontProfile);
  const setFontsLoaded = useStore((s) => s.setFontsLoaded);
  const setAnnotations = useStore((s) => s.setAnnotations);
  const fontsLoaded = useStore((s) => s.fontsLoaded);

  const apiBase = config.apiBase ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.authToken}`,
  };

  const bootstrap = useCallback(async () => {
    try {
      // Step 1: Validate session
      const sessionRes = await fetch(
        `${apiBase}/sessions/${config.sessionId}`,
        { headers }
      );
      if (!sessionRes.ok) throw new Error("Failed to validate session");
      const sessionData = await sessionRes.json();
      setSession({
        sessionId: config.sessionId,
        documentId: config.documentId,
        tenantId: config.tenantId,
        currentUser: sessionData.user,
      });
      setAuthToken(config.authToken);
      setBootstrapStep(1);

      // Step 2: Resolve permissions
      const permRes = await fetch(`${apiBase}/users/me/permissions`, {
        headers,
      });
      if (!permRes.ok) throw new Error("Failed to resolve permissions");
      const { permissions } = await permRes.json();
      setPermissions(permissions);
      setBootstrapStep(2);

      // Step 3: Load document metadata
      const docRes = await fetch(
        `${apiBase}/documents/${config.documentId}`,
        { headers }
      );
      if (!docRes.ok) throw new Error("Failed to load document metadata");
      const doc = await docRes.json();
      setBootstrapStep(3);

      // Step 4: Fetch version history
      const versionsRes = await fetch(
        `${apiBase}/documents/${config.documentId}/versions`,
        { headers }
      );
      if (!versionsRes.ok) throw new Error("Failed to fetch version history");
      const { versions } = await versionsRes.json();
      setVersionHistory(versions);
      setBootstrapStep(4);

      // Step 5: Resolve epub URL
      const currentVersion =
        versions.find(
          (v: { id: string }) => v.id === doc.currentVersionId
        ) ?? versions[0];
      const epubUrl =
        currentVersion?.epubSignedUrl ??
        `${apiBase}/documents/${config.documentId}/epub`;
      setDocument({
        epubUrl,
        sourceFormat: doc.sourceFormat,
        conversionManifest: currentVersion?.conversionManifest ?? null,
      });
      setBootstrapStep(5);

      // Step 6: Fetch active font profile
      let fontProfile: FontProfile | null = null;
      const fontRes = await fetch(
        `${apiBase}/tenants/${config.tenantId}/font-profiles/active`,
        { headers }
      );
      if (fontRes.ok) {
        fontProfile = await fontRes.json();
        if (fontProfile) setFontProfile(fontProfile);
      }
      setBootstrapStep(6);

      // Step 7: Preload fonts (non-fatal)
      if (fontProfile) {
        try {
          await preloadFonts(fontProfile);
        } catch {
          // Font load failure is non-fatal — continue without custom fonts
        }
      }
      setFontsLoaded(true);
      setBootstrapStep(7);

      // Step 8: Socket.IO connection (fire-and-forget, non-blocking)
      setBootstrapStep(8);

      // Step 9: Sync annotations
      const annotationsRes = await fetch(
        `${apiBase}/documents/${config.documentId}/annotations`,
        { headers }
      );
      if (annotationsRes.ok) {
        const { annotations } = await annotationsRes.json();
        setAnnotations(annotations);
      }
      setBootstrapStep(9);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.sessionId,
    config.documentId,
    config.tenantId,
    config.authToken,
    config.apiBase,
    retryKey,
  ]);

  useEffect(() => {
    setBootstrapStep(0);
    setError(null);
    useStore.setState({ fontsLoaded: false });
    bootstrap();
  }, [bootstrap]);

  if (error) {
    return (
      <div role="alert" data-testid="bootstrap-error">
        <p>{error}</p>
        <button onClick={() => setRetryKey((k) => k + 1)}>Retry</button>
      </div>
    );
  }

  if (!fontsLoaded || bootstrapStep < 7) {
    return (
      <BootstrapLoader
        step={bootstrapStep}
        total={BOOTSTRAP_STEPS.length}
        steps={BOOTSTRAP_STEPS}
      />
    );
  }

  return <>{children}</>;
}
