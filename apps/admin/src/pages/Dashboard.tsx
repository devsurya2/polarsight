import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { Loading, ErrorNote, PageHeader, StatusBadge, Table, Td, Th, EmptyState } from "@/components/ui";

interface Summary {
  enquiries: { total: number; new: number };
  programmes: { total: number; published: number; draft: number };
  content: { blocks: number; faqs: number; media: number };
  recentEnquiries: Array<{
    id: string;
    name: string;
    email: string;
    organisation: string | null;
    status: string;
    createdAt: string;
  }>;
}

function Stat({ label, value, sub, to }: { label: string; value: number | string; sub?: string; to?: string }) {
  const body = (
    <div className="panel h-full p-4 transition-colors hover:border-[#39414F]">
      <p className="label">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-faint">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Dashboard() {
  const { user, canAny } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api
      .get<Summary>("/dashboard", ac.signal)
      .then(setData)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`}
        description="A snapshot of the website and the enquiries coming in."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Enquiries"
          value={data.enquiries.total}
          sub={`${data.enquiries.new} awaiting triage`}
          to={canAny("enquiry:read") ? "/enquiries" : undefined}
        />
        <Stat
          label="Programmes"
          value={data.programmes.total}
          sub={`${data.programmes.published} published · ${data.programmes.draft} draft`}
          to={canAny("programme:read") ? "/programmes" : undefined}
        />
        <Stat
          label="Content blocks"
          value={data.content.blocks}
          sub={`${data.content.faqs} FAQs`}
          to={canAny("content:read") ? "/content" : undefined}
        />
        <Stat
          label="Media"
          value={data.content.media}
          sub="files in the library"
          to={canAny("media:read") ? "/media" : undefined}
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent enquiries</h2>
          {canAny("enquiry:read") && (
            <Link to="/enquiries" className="text-xs text-accent-ice hover:underline">
              View all
            </Link>
          )}
        </div>

        {data.recentEnquiries.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="No enquiries yet"
              hint="Submissions from the website contact form will appear here."
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Organisation</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentEnquiries.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-raised/50">
                  <Td>
                    <Link to={`/enquiries/${e.id}`} className="font-medium hover:text-accent-ice">
                      {e.name}
                    </Link>
                    <span className="block text-xs text-faint">{e.email}</span>
                  </Td>
                  <Td className="text-body">{e.organisation ?? "—"}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
                  <Td className="whitespace-nowrap text-xs text-faint">{relativeTime(e.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
