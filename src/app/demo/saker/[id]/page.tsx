"use client";

/**
 * Demo — case detail. Renders Peter's `CaseViewV2` workbench with
 * `viewerRole="creditor"`. All data flows from the demo fixtures
 * (see `lib/demo-fixtures.ts`), no backend.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import {
  type AgenticPendingProposal,
  type AgenticTimelineResponse,
  type CaseDetail,
  type DraftDetail,
  getAgenticTimeline,
  getCase,
  getDraftForCase,
} from "../../../../lib/api";
import { CaseViewV2 } from "../../../../components/case/case-view-v2";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DemoCaseDetailPage(props: PageProps): JSX.Element {
  const { id } = use(props.params);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [draftDetail, setDraftDetail] = useState<DraftDetail | null>(null);
  const [agentic, setAgentic] = useState<AgenticTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    const [d, dr, at] = await Promise.all([
      getCase(id, null),
      getDraftForCase(id, null),
      getAgenticTimeline(id, null).catch(() => null),
    ]);
    setDetail(d);
    setDraftDetail(dr);
    setAgentic(at);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Skeleton />;
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-sm text-clay-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>Kunne ikke laste kravet: {error}</span>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="py-6 text-sm text-ink-600">
            Krav ikke funnet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingProposal: AgenticPendingProposal | null = agentic?.pending_proposal ?? null;
  const agenticSteps = agentic?.steps ?? [];

  return (
    <div className="space-y-4">
      <BackLink />
      <CaseViewV2
        caseId={id}
        detail={detail}
        draftDetail={draftDetail}
        pendingProposal={pendingProposal}
        agenticSteps={agenticSteps}
        pendingInputSafetyAlert={null}
        viewerRole="creditor"
        onReload={() => {
          void reload();
        }}
      />
    </div>
  );
}

function BackLink(): JSX.Element {
  return (
    <Link href="/demo/saker">
      <Button variant="ghost" size="sm">
        <ArrowLeft className="h-3.5 w-3.5" />
        Alle krav
      </Button>
    </Link>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="h-8 w-32 animate-pulse rounded bg-ink-150" />
      <div className="h-24 animate-pulse rounded-lg border border-ink-200 bg-ink-50" />
      <div className="h-48 animate-pulse rounded-lg border border-ink-200 bg-ink-50" />
    </div>
  );
}
