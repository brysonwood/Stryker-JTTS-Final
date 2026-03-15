import './env';
import express from 'express';
import cors from 'cors';
import api from './routes';
import { runMediaRetentionCleanup } from './services/mediaRetention';

const app = express();
const port = process.env.PORT || 4000;

// Parse allowed origins from the CORS_ORIGIN env var.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin and non-browser requests like curl.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', api);

const retentionScheduleEnabled = process.env.MEDIA_RETENTION_SCHEDULED !== 'false';
const retentionIntervalHours = Number(process.env.MEDIA_RETENTION_INTERVAL_HOURS || 24);
if (retentionScheduleEnabled && Number.isFinite(retentionIntervalHours) && retentionIntervalHours > 0) {
  const intervalMs = Math.round(retentionIntervalHours * 60 * 60 * 1000);

  // Run cleanup on a timer - don't block startup.
  setInterval(() => {
    runMediaRetentionCleanup({ dryRun: false })
      .then((result) => {
        if (result.matched > 0 || result.failures > 0) {
          console.log(
            '[retention] completed',
            `matched=${result.matched}`,
            `deletedRecords=${result.deletedRecords}`,
            `deletedObjects=${result.deletedObjects}`,
            `failures=${result.failures}`,
          );
        }
      })
      .catch((error) => {
        console.error('[retention] cleanup failed', error);
      });
  }, intervalMs);
}

app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
