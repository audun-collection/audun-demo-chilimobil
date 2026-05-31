"use client";

/**
 * Banner rendered on `/cases/:id` when the Claim is opted-out
 * (`cases.opted_out_at IS NOT NULL`). Operator-facing affordance so
 * the rejection-on-Send isn't opaque: surfaces the opt-out state and
 * exposes a "Restore communication" action that POSTs to
 * `/api/cases/:id/restore-communication` after capturing a reason.
 *
 * Per `docs/features/operator-opt-out-affordances.md`
 * (SOL-46; sibling of SOL-45 backend endpoint).
 *
 * Visual tone is informational (clay-neutral), not error-level — the
 * Case isn't broken; the Debtor exercised a right. The action button
 * sits inside the banner so it's discoverable without scrolling.
 */

import { useState } from "react";
import { Loader2, MailX } from "lucide-react";

import { Button } from "../ui/button";
import { restoreCommunication } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

interface OptOutBannerProps {
  caseId: string;
  optedOutAt: string;
  onRestored: () => void;
}

export function OptOutBanner({
  caseId,
  optedOutAt,
  onRestored,
}: OptOutBannerProps) {
  const { getIdToken } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedLen = reason.trim().length;
  const reasonValid = trimmedLen >= REASON_MIN_LENGTH;

  function openModal() {
    setReason("");
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (pending) return;
    setModalOpen(false);
    setReason("");
    setError(null);
  }

  async function confirm() {
    if (!reasonValid || pending) return;
    setPending(true);
    setError(null);
    try {
      const token = await getIdToken();
      await restoreCommunication(caseId, reason.trim(), token);
      setModalOpen(false);
      setReason("");
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-3 rounded-md border border-clay-700/20 bg-clay-50/40 px-3 py-2 text-[12.5px] text-clay-900">
        <MailX className="mt-0.5 h-4 w-4 flex-none text-clay-700" />
        <p className="min-w-0 flex-1">
          <strong>This case is opted out.</strong> The Debtor sent STOP
          on{" "}
          <span className="font-mono text-[11.5px]">
            {formatOptOutTimestamp(optedOutAt)}
          </span>
          . Outbound SMS is blocked at the Rules Engine and the send
          route.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={openModal}
          aria-label="Restore communication for this case"
        >
          Restore communication
        </Button>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opt-out-restore-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h3
              id="opt-out-restore-title"
              className="font-serif text-lg text-ink-900"
            >
              Restore communication?
            </h3>
            <p className="text-sm text-ink-700">
              This re-enables outbound SMS for this case and writes a{" "}
              <code className="rounded bg-ink-100 px-1 font-mono text-[11.5px]">
                communication.opt_out_reversed
              </code>{" "}
              audit row. A reason is required (minimum{" "}
              {REASON_MIN_LENGTH} characters).
            </p>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-ink-700">
                Reason
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={REASON_MAX_LENGTH}
                className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm focus:border-clay-600 focus:outline-none"
                placeholder="e.g. Debtor confirmed by phone that the STOP was a typo."
                disabled={pending}
                autoFocus
              />
              <span
                className={
                  reasonValid
                    ? "text-[11px] text-ink-500"
                    : "text-[11px] text-amber-700"
                }
              >
                {trimmedLen} / {REASON_MIN_LENGTH} characters minimum
              </span>
            </label>
            {error ? (
              <p className="text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeModal}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void confirm()}
                disabled={!reasonValid || pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  "Confirm restore"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatOptOutTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // YYYY-MM-DD HH:mm UTC — same shape as the rest of the case page's
  // monospace timestamps so the banner doesn't introduce a new style.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
