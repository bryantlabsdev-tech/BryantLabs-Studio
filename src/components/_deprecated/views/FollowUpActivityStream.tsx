import type { FollowUpActivityItem } from "@/core/build/followUpRun";
import type { FollowUpActivityRun } from "@/core/build/followUpActivityLog";

interface FollowUpActivityStreamProps {
  liveItems: readonly FollowUpActivityItem[];
  completedRuns: readonly FollowUpActivityRun[];
  onAdvancedLogs?: () => void;
}

export function FollowUpActivityStream({
  liveItems,
  completedRuns,
  onAdvancedLogs,
}: FollowUpActivityStreamProps) {
  const lastRun = completedRuns[completedRuns.length - 1];
  const items = liveItems.length > 0 ? liveItems : (lastRun?.items ?? []);

  if (items.length === 0) return null;

  return (
    <section className="follow-up-activity" aria-label="Live file activity">
      <div className="build-view__timeline-head">
        <h4 className="build-view__heading">File activity</h4>
        {onAdvancedLogs ? (
          <button type="button" className="build-view__link" onClick={onAdvancedLogs}>
            Advanced logs
          </button>
        ) : null}
      </div>
      <ul className="follow-up-activity__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`follow-up-activity__item follow-up-activity__item--${item.status}`}
          >
            {item.message.split("\n").map((line, i) => (
              <span key={i} className="follow-up-activity__line">
                {line}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
