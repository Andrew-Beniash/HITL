import { usePresence, useSession } from "../../store/index.js";

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

interface PresenceAvatarStackProps {
  rendition: any | null;
}

export function PresenceAvatarStack({ rendition }: PresenceAvatarStackProps) {
  const { activeUsers } = usePresence();
  const { currentUser } = useSession();

  const visible = activeUsers.slice(0, 5);
  const overflow = Math.max(0, activeUsers.length - 5);

  if (activeUsers.length === 0) return null;

  return (
    <div
      className="flex items-center -space-x-2"
      role="list"
      aria-label="Active collaborators"
    >
      {visible.map((user) => {
        const isSelf = user.userId === currentUser?.id;
        return (
          <button
            key={user.userId}
            type="button"
            aria-label={`Go to ${user.displayName}'s position`}
            title={`${user.displayName} · ${relativeTime(user.lastSeenAt)}`}
            onClick={() => rendition?.display(user.currentCfi)}
            className={`relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isSelf
                ? "border-blue-500 ring-2 ring-blue-500 ring-offset-slate-950"
                : "border-slate-700 focus:ring-cyan-400"
            }`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-slate-700 text-xs font-medium text-white">
                {user.displayName[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </button>
        );
      })}

      {overflow > 0 && (
        <span
          aria-label={`${overflow} more collaborators`}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800 text-xs font-medium text-slate-300"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
