import { DocumentPage } from "./pages/DocumentPage.js";
import { useDocument } from "./store/index.js";

export default function App() {
  const { epubUrl } = useDocument();

  return (
    <main className="min-h-screen">
      {epubUrl ? (
        <DocumentPage />
      ) : (
        <section className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-8 shadow-2xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
              HITL Module
            </p>
            <h1 className="mt-4 text-4xl font-semibold text-white">
              Review workspace waiting for session bootstrap
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              The document page mounts once the provider resolves the EPUB URL and
              active font profile.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
