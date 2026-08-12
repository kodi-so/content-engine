import { useAction, useMutation } from "convex/react";
import { Send, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { AccountStatusPill, formatAccountDate, ManagedSectionHeading } from "./managedAccountUi";

export function AccountPostHistory({ posts }: { posts: Doc<"accountPosts">[] }) {
  const approvePost = useAction(api.accounts.managedAccounts.approvePost);
  const rejectPost = useMutation(api.accounts.managedAccounts.rejectPost);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const approve = async (id: Id<"accountPosts">) => {
    setBusyId(String(id));
    setStatus("Publishing approved post…");
    try {
      await approvePost({ id });
      setStatus("Post sent to the publishing provider");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to publish post");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: Id<"accountPosts">) => {
    setBusyId(String(id));
    try {
      await rejectPost({ id, reason: "Rejected from account workspace" });
      setStatus("Post rejected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to reject post");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid gap-3">
      <ManagedSectionHeading title="Post history" description="Manual and scheduled posts live in one timeline, so every result can inform the next idea." />
      {status ? <div className="text-[0.76rem] font-[650] text-[var(--color-ink-muted)]">{status}</div> : null}
      {posts.length === 0 ? <div className="border-y border-[var(--color-border)] py-8 text-center text-[0.82rem] text-[var(--color-ink-muted)]">No posts have been created for this account yet.</div> : (
        <div className="overflow-hidden border-y border-[var(--color-border)]">
          {posts.map((post) => (
            <article className="grid gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={post._id}>
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2"><AccountStatusPill status={post.status} /><span className="text-[0.7rem] capitalize text-[var(--color-ink-faint)]">{post.origin.replace(/_/g, " ")} · {formatAccountDate(post.publishedAt ?? post.scheduledFor ?? post.createdAt)}</span></div>
                <p className="m-0 line-clamp-2 text-[0.83rem] leading-relaxed text-[var(--color-ink-soft)]">{post.caption || "Media post without a caption"}</p>
              </div>
              {post.status === "awaiting_approval" ? <div className="flex gap-2"><button className="secondary-button" disabled={busyId === String(post._id)} onClick={() => void reject(post._id)} type="button"><X size={14} />Reject</button><button className="primary-button" disabled={busyId === String(post._id)} onClick={() => void approve(post._id)} type="button"><Send size={14} />Approve</button></div> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
