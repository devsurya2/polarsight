/**
 * Website pages.
 *
 * Each public page has a fixed set of editable regions, declared by
 * the API. This screen renders a form over whatever regions the page
 * actually has, so the CMS can never remove a section the page's
 * component expects, nor add one it does not understand.
 *
 * The homepage's first interface — hero, navigation, video, layout —
 * is not an editable region and does not appear here at all.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@/lib/hooks";
import { formatDateTime, relativeTime } from "@/lib/format";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Notice,
  PageHeader,
  StatusBadge,
  TableSkeleton,
} from "@/components/ui";

interface PageRow {
  id: string;
  key: string;
  title: string;
  label: string;
  route: string | null;
  description: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  hasSeo: boolean;
  hasUnpublishedChanges: boolean;
}

export function PagesPage() {
  const { data, error, initial, reload } = useQuery<{ items: PageRow[] }>("/pages");
  const items = data?.items ?? [];
  const pending = items.filter((p) => p.hasUnpublishedChanges).length;

  return (
    <>
      <PageHeader
        title="Website pages"
        description="The editable regions of each public page, with their own draft and published copies. A draft is never served to visitors."
        breadcrumbs={[{ label: "Website" }, { label: "Pages" }]}
        meta={
          pending > 0 ? (
            <Badge tone="caution" icon="alert">
              {pending} with unpublished changes
            </Badge>
          ) : items.length > 0 ? (
            <Badge tone="positive" icon="check">
              All changes published
            </Badge>
          ) : null
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Notice tone="info">
        The homepage's first screen — its hero, navigation, video and layout — is not editable
        content and is not represented here, so no change on this screen can affect it.
      </Notice>

      <div className="mt-4">
        {initial ? (
          <TableSkeleton rows={6} cols={3} />
        ) : items.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon="pages"
              title="No editable pages"
              hint="Run the database seed to create them: npm run db:seed"
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <Link
                key={p.key}
                to={`/pages/${p.key}`}
                className="panel group flex flex-col p-5 transition-colors hover:border-line-strong hover:bg-raised/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{p.label}</h2>
                    {p.route && <p className="mono mt-0.5 truncate text-faint">{p.route}</p>}
                    {p.description && (
                      <p className="mt-2 text-xs leading-relaxed text-body clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={p.status} />
                  {p.hasUnpublishedChanges && (
                    <Badge tone="caution" icon="edit">
                      Unpublished changes
                    </Badge>
                  )}
                  {!p.hasSeo && (
                    <Badge tone="neutral" icon="alert">
                      No SEO
                    </Badge>
                  )}
                </div>

                <p className="mt-4 text-[0.6875rem] text-faint" title={formatDateTime(p.updatedAt)}>
                  Edited {relativeTime(p.updatedAt)}
                  {p.publishedAt && ` · published ${relativeTime(p.publishedAt)}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
