import type { ChangeEvent } from "react";
import type { AnnotationType } from "@hitl/shared-types";
import { useAnnotations } from "../../store/index.js";

export function FilterBar() {
  const { filterState, setFilter } = useAnnotations();

  const handleDateChange =
    (key: "fromDate" | "toDate") => (event: ChangeEvent<HTMLInputElement>) => {
      setFilter({
        [key]: event.target.value ? new Date(event.target.value) : undefined,
      });
    };

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Type
        <select
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          value={filterState.type}
          onChange={(event) =>
            setFilter({ type: event.target.value as AnnotationType | "all" })
          }
        >
          <option value="all">All</option>
          <option value="critical_flag">Critical Flag</option>
          <option value="attention_marker">Attention Marker</option>
          <option value="validation_notice">Validation Notice</option>
          <option value="human_comment">Human Comment</option>
          <option value="review_request">Review Request</option>
          <option value="edit_suggestion">Edit Suggestion</option>
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Initiator
        <select
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          value={filterState.initiator}
          onChange={(event) =>
            setFilter({ initiator: event.target.value as "human" | "ai" | "all" })
          }
        >
          <option value="all">All</option>
          <option value="human">Human</option>
          <option value="ai">AI</option>
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-300">
        Status
        <select
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          value={filterState.status}
          onChange={(event) =>
            setFilter({ status: event.target.value as "open" | "resolved" | "all" })
          }
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          From
          <input
            type="date"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            onChange={handleDateChange("fromDate")}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          To
          <input
            type="date"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            onChange={handleDateChange("toDate")}
          />
        </label>
      </div>
    </div>
  );
}
