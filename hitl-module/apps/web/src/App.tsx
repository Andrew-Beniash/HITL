import { create } from "zustand";

type AppState = {
  status: "idle" | "ready";
  setStatus: (status: AppState["status"]) => void;
};

const useAppStore = create<AppState>((set) => ({
  status: "ready",
  setStatus: (status) => set({ status })
}));

const services = [
  ["Document Storage", 3001],
  ["EPUB Conversion", 3002],
  ["Annotation Session", 3003],
  ["Collaboration", 3004],
  ["AI Orchestration", 3005],
  ["Audit Trail", 3006],
  ["Notification", 3007],
  ["Platform Config", 3008]
];

export default function App() {
  const status = useAppStore((state) => state.status);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12">
      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
          HITL Module
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-white">
          Review and AI collaboration workspace scaffold
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          This frontend bootstraps the monorepo foundation for document review,
          annotation sessions, and real-time collaboration services.
        </p>
        <div className="mt-6 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
          Frontend status: {status}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {services.map(([name, port]) => (
          <article
            key={name}
            className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"
          >
            <h2 className="text-lg font-medium text-white">{name}</h2>
            <p className="mt-2 text-sm text-slate-300">Stub service on port {port}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
