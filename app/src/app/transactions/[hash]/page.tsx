"use client";
import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/components/useLive";
import { opAccent } from "@/lib/tx";
import { truncHash } from "@/lib/format";


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5 border-b border-white/[0.03] last:border-0">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium w-32 shrink-0 pt-0.5">{label}</span>
      <div className="text-[12px] text-zinc-300 break-all min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CopyHash({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="hash text-[12px] text-zinc-300 hover:text-white transition-colors inline-flex items-center gap-1.5"
      title="Copy"
    >
      {value}
      <span className="text-[9px] text-zinc-600">{done ? "copied" : "⧉"}</span>
    </button>
  );
}

function Operation({ op }: { op: any }) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <div className="glass rounded-lg overflow-hidden">
      <Row label="Index">{op.index}</Row>
      <Row label="Opcode">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${opAccent(op.opcode)}`}>{op.name}</span>
        <span className="text-zinc-600 ml-2">0x{(op.opcode >>> 0).toString(16).padStart(2, "0")} ({op.opcode})</span>
      </Row>

      {/* ChannelInscribe */}
      {op.opcode === 17 && (
        <>
          {op.channel && <Row label="Channel"><span className="hash">{op.channel}</span></Row>}
          {op.inscriptionHex != null && (
            <Row label="Inscription">
              <div className="text-zinc-500 text-[11px] mb-1">{op.inscriptionSize} bytes</div>
              <div className="hash text-[11px] text-zinc-400 break-all">{op.inscriptionHex.length > 160 ? op.inscriptionHex.slice(0, 160) + "…" : op.inscriptionHex}</div>
            </Row>
          )}
        </>
      )}

      {/* Transfer */}
      {op.opcode === 0 && (
        <Row label="Transfer">
          {op.inputs?.length ? (
            <div className="mb-2">
              <div className="text-[10px] text-zinc-600 mb-1">Inputs — spent notes (opaque commitments, not addresses)</div>
              {op.inputs.map((inp: string, i: number) => <div key={i} className="hash text-[11px] text-zinc-400">{truncHash(inp, 14, 8)}</div>)}
            </div>
          ) : null}
          {op.outputs?.length ? (
            <div>
              <div className="text-[10px] text-zinc-600 mb-1">Outputs — recipient wallets</div>
              {op.outputs.map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="hash text-[11px] text-emerald-400/80 truncate">{truncHash(o.pk, 14, 8)}</span>
                  <span className="tabular-nums text-[11px] text-zinc-300">{Number(o.value).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Row>
      )}

      {/* Raw payload */}
      <Row label="Payload">
        <button onClick={() => setShowPayload(s => !s)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
          {showPayload ? "▾" : "▸"} {Object.keys(op.payload ?? {}).length} field(s)
        </button>
        {showPayload && (
          <pre className="mt-2 text-[10px] text-zinc-400 bg-black/40 border border-white/[0.05] rounded p-3 overflow-x-auto max-h-[300px]">{JSON.stringify(op.payload, null, 2)}</pre>
        )}
      </Row>
    </div>
  );
}

export default function TxDetailPage({ params }: { params: { hash: string } }) {
  const hash = params.hash;
  const { data, error } = useLive<any>(`/api/tx/${hash}`, 0);

  return (
    <div className="px-6 py-5 mx-auto pb-14 max-w-[1100px]">
      <div className="flex items-center gap-2 text-[11px] text-zinc-600 mb-3">
        <Link href="/transactions" className="hover:text-zinc-300">Transactions</Link>
        <span>›</span>
        <span className="hash text-zinc-500">{truncHash(hash, 8, 6)}</span>
      </div>

      <h1 className="text-xl font-bold tracking-tight mb-1">Transaction{(data?.transactions?.length ?? 0) > 1 ? "s" : ""}</h1>
      <div className="mb-5"><CopyHash value={hash} /></div>

      {error || data?.error ? (
        <div className="glass rounded-xl px-5 py-4 text-[12px] text-zinc-500">Could not load this transaction from the node ({data?.error || "unavailable"}).</div>
      ) : !data ? (
        <div className="glass rounded-xl px-5 py-10 text-center text-[12px] text-zinc-600">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* Block / header */}
          <div className="glass rounded-xl overflow-hidden">
            <Row label="Block">
              {data.meta?.height != null ? (
                <Link href={`/blocks/${data.meta.height}`} className="text-emerald-400/80 hover:text-emerald-300 transition-colors">
                  #{data.meta.height.toLocaleString()}
                </Link>
              ) : "—"}
              <span className="text-zinc-600 ml-2">slot {data.header?.slot?.toLocaleString() ?? data.meta?.slot?.toLocaleString() ?? "—"}</span>
            </Row>
            <Row label="Version">{data.header?.version ?? "—"}</Row>
            <Row label="Parent"><span className="hash">{truncHash(data.header?.parent_block ?? "", 14, 8)}</span></Row>
            <Row label="Transactions">{data.transactions?.length ?? 0}</Row>
          </div>

          {/* Each transaction */}
          {(data.transactions ?? []).map((tx: any, ti: number) => (
            <div key={ti} className="space-y-3">
              <div className="glass rounded-xl overflow-hidden">
                <Row label="Index in block">{tx.index}</Row>
                <Row label="Operations">{tx.opCount}</Row>
                {(tx.executionGasPrice != null || tx.storageGasPrice != null) && (
                  <Row label="Gas price">
                    <span className="text-zinc-400">exec </span>{String(tx.executionGasPrice ?? "—")}
                    <span className="text-zinc-400 ml-3">storage </span>{String(tx.storageGasPrice ?? "—")}
                  </Row>
                )}
              </div>

              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium pt-1">Operations</p>
              <div className="space-y-3">
                {(tx.ops ?? []).map((op: any, oi: number) => <Operation key={oi} op={op} />)}
              </div>
            </div>
          ))}

          {(data.transactions?.length ?? 0) === 0 && (
            <div className="glass rounded-xl px-5 py-8 text-center text-[12px] text-zinc-600">This block contains no decodable transactions.</div>
          )}
        </div>
      )}
    </div>
  );
}
