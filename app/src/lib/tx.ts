// Decodes a Logos block (from the node's POST /storage/block) into transactions + operations.
// A transaction is a `mantle_tx` with an `ops[]` list; each op has an opcode + payload.

export const OP_NAMES: Record<number, string> = {
  0: "Transfer", // 0x00 — note transfer (shielded inputs, {pk,value} outputs)
  17: "ChannelInscribe", // 0x11 — write an inscription to a channel
};

export function opName(code: number): string {
  return OP_NAMES[code] ?? `Op 0x${(code >>> 0).toString(16).padStart(2, "0")}`;
}

// Op categories get a subtle colour so types are scannable (like the NODERS explorer).
export function opAccent(code: number): string {
  if (code === 0) return "text-emerald-400/80 bg-emerald-500/[0.08] border-emerald-500/15";
  if (code === 17) return "text-violet-400/80 bg-violet-500/[0.08] border-violet-500/15";
  return "text-zinc-400 bg-white/[0.04] border-white/10";
}

function bytesToHex(arr: any): string | null {
  if (!Array.isArray(arr)) return typeof arr === "string" ? arr : null;
  return arr.map((b: number) => (b & 0xff).toString(16).padStart(2, "0")).join("");
}

export interface DecodedOp {
  index: number;
  opcode: number;
  name: string;
  channel?: string;
  inscriptionHex?: string;
  inscriptionSize?: number;
  inputs?: string[];
  outputs?: { pk: string; value: number }[];
  payload: any;
}

export interface DecodedTx {
  index: number;
  opCount: number;
  opcodes: { code: number; name: string }[];
  executionGasPrice?: any;
  storageGasPrice?: any;
  ops: DecodedOp[];
}

export function decodeBlockTxs(block: any): DecodedTx[] {
  const txs = block?.transactions ?? [];
  return txs.map((tx: any, ti: number): DecodedTx => {
    const m = tx.mantle_tx ?? tx ?? {};
    const ops: DecodedOp[] = (m.ops ?? []).map((op: any, oi: number): DecodedOp => {
      const code = op.opcode;
      const p = op.payload ?? {};
      const d: DecodedOp = { index: oi, opcode: code, name: opName(code), payload: p };
      if (code === 17) {
        d.channel = p.channel_id;
        const hex = bytesToHex(p.inscription);
        d.inscriptionHex = hex ?? undefined;
        d.inscriptionSize = Array.isArray(p.inscription) ? p.inscription.length : hex ? hex.length / 2 : undefined;
      } else if (code === 0) {
        d.inputs = Array.isArray(p.inputs) ? p.inputs : undefined;
        d.outputs = Array.isArray(p.outputs)
          ? p.outputs.map((o: any) => ({ pk: o.pk, value: o.value }))
          : undefined;
      }
      return d;
    });
    return {
      index: ti,
      opCount: ops.length,
      opcodes: ops.map((o) => ({ code: o.opcode, name: o.name })),
      executionGasPrice: m.execution_gas_price,
      storageGasPrice: m.storage_gas_price,
      ops,
    };
  });
}
