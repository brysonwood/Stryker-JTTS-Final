import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { buildDraft } from '../services/invoiceDraft';
import { dequeuePdfJob, updatePdfJobStatus } from '../services/pdfQueue';

function ensureOutputDir() {
  const dir = path.resolve(process.cwd(), 'tmp', 'invoices');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePdf(filePath: string, title: string, lines: string[]) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text(title);
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(1);

    for (const line of lines) {
      doc.fontSize(11).text(line);
    }

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

async function processPdfJob(job: { id: string; jobId: number | null }) {
  await updatePdfJobStatus(job.id, { state: 'processing', error: undefined });

  try {
    const draft = await buildDraft(job.jobId);
    const outputDir = ensureOutputDir();
    const outputPath = path.join(outputDir, `invoice-${job.id}.pdf`);

    const lines: string[] = [];
    lines.push(`Jobs included: ${draft.totals.jobs}`);
    lines.push(`Labor total: $${draft.totals.labor.toFixed(2)}`);
    lines.push(`Parts total: $${draft.totals.parts.toFixed(2)}`);
    lines.push(`Grand total: $${draft.totals.grandTotal.toFixed(2)}`);
    lines.push('');

    for (const jobDraft of draft.jobs) {
      lines.push(`[Job ${jobDraft.jobId}] ${jobDraft.description} (${jobDraft.customer})`);
      lines.push(`  Status: ${jobDraft.status}`);
      lines.push(`  Labor: $${jobDraft.laborTotal.toFixed(2)} | Parts: $${jobDraft.partsTotal.toFixed(2)} | Total: $${jobDraft.total.toFixed(2)}`);
    }

    await writePdf(outputPath, 'Stryker JTTS Invoice Draft', lines);

    await updatePdfJobStatus(job.id, {
      state: 'completed',
      outputPath,
      error: undefined,
    });
  } catch (error) {
    await updatePdfJobStatus(job.id, {
      state: 'failed',
      error: error instanceof Error ? error.message : 'PDF generation failed',
    });
  }
}

export async function runPdfWorkerLoop() {
  console.log('[pdf-worker] started');
  while (true) {
    const job = await dequeuePdfJob(5);
    if (!job) {
      continue;
    }
    await processPdfJob(job);
  }
}

if (require.main === module) {
  runPdfWorkerLoop().catch((error) => {
    console.error('[pdf-worker] fatal error', error);
    process.exit(1);
  });
}
