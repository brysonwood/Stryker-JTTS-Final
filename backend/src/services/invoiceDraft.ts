import prisma from './prismaClient';

type DraftTimeEntry = {
  duration: number | null;
  start: Date;
  end: Date | null;
};

type DraftPart = {
  sku: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
};

type DraftJob = {
  id: number;
  description: string;
  status: string;
  customer: { name: string } | null;
  timeEntries: DraftTimeEntry[];
  parts: DraftPart[];
};

export type InvoiceLine = {
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  type: 'labor' | 'part';
};

export type JobDraft = {
  jobId: number;
  description: string;
  customer: string;
  status: string;
  laborHours: number;
  laborTotal: number;
  partsTotal: number;
  total: number;
  lines: InvoiceLine[];
};

const DEFAULT_LABOR_RATE = Number(process.env.DEFAULT_LABOR_RATE || 120);

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

function csvEscape(value: string): string {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export async function buildDraft(jobFilterId: number | null) {
  // Load all job data at once to keep the totals consistent.
  const jobs: DraftJob[] = await prisma.job.findMany({
    where: jobFilterId ? { id: jobFilterId } : undefined,
    include: {
      customer: true,
      timeEntries: true,
      parts: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const drafts: JobDraft[] = jobs.map((job: DraftJob) => {
    // Handle entries with a stored duration and ones that only have a start/end time.
    const laborMinutes = job.timeEntries.reduce((acc: number, entry: DraftTimeEntry) => {
      if (typeof entry.duration === 'number') {
        return acc + Math.max(0, entry.duration);
      }
      if (entry.end) {
        const computed = Math.round((entry.end.getTime() - entry.start.getTime()) / 60000);
        return acc + Math.max(0, computed);
      }
      return acc;
    }, 0);

    const laborHours = Number((laborMinutes / 60).toFixed(2));
    const laborTotal = toMoney(laborHours * DEFAULT_LABOR_RATE);

    const partLines: InvoiceLine[] = job.parts.map((part: DraftPart) => {
      const qty = Math.max(0, Number(part.quantity || 0));
      const unitPrice = Math.max(0, Number(part.unitPrice || 0));
      const lineTotal = toMoney(qty * unitPrice);
      return {
        type: 'part',
        description: part.description?.trim() || `Part ${part.sku}`,
        qty,
        unitPrice,
        lineTotal,
      };
    });

    const partsTotal = toMoney(partLines.reduce((acc, line) => acc + line.lineTotal, 0));
    const total = toMoney(laborTotal + partsTotal);

    const lines: InvoiceLine[] = [
      {
        type: 'labor',
        description: 'Labor',
        qty: laborHours,
        unitPrice: DEFAULT_LABOR_RATE,
        lineTotal: laborTotal,
      },
      ...partLines,
    ];

    return {
      jobId: job.id,
      description: job.description,
      customer: job.customer?.name || 'Unknown customer',
      status: job.status,
      laborHours,
      laborTotal,
      partsTotal,
      total,
      lines,
    };
  });

  const totals = {
    jobs: drafts.length,
    labor: toMoney(drafts.reduce((acc, draft) => acc + draft.laborTotal, 0)),
    parts: toMoney(drafts.reduce((acc, draft) => acc + draft.partsTotal, 0)),
  };

  return {
    generatedAt: new Date().toISOString(),
    laborRate: DEFAULT_LABOR_RATE,
    totals: {
      ...totals,
      grandTotal: toMoney(totals.labor + totals.parts),
    },
    jobs: drafts,
  };
}

export function toCsv(payload: Awaited<ReturnType<typeof buildDraft>>) {
  const header = [
    'jobId',
    'jobDescription',
    'customer',
    'status',
    'lineType',
    'lineDescription',
    'qty',
    'unitPrice',
    'lineTotal',
    'jobTotal',
  ];
  const rows: string[] = [header.join(',')];

  // Emit one row per invoice line to keep labor and parts itemized in exports.
  for (const draft of payload.jobs) {
    for (const line of draft.lines) {
      rows.push([
        String(draft.jobId),
        csvEscape(draft.description),
        csvEscape(draft.customer),
        csvEscape(draft.status),
        line.type,
        csvEscape(line.description),
        String(line.qty),
        String(line.unitPrice),
        String(line.lineTotal),
        String(draft.total),
      ].join(','));
    }
  }

  return rows.join('\n');
}
