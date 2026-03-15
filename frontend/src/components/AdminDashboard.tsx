import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminDashboard } from '../lib/api';
import type { AdminDashboardData, DashboardPoint } from '../types';

type Props = {
  token: string;
  onOpenJob: (jobId: number) => void;
  onOpenProfile: (userId: number) => void;
};

function maxValue(points: DashboardPoint[], key: 'hours' | 'cost') {
  return Math.max(1, ...points.map((point) => point[key] || 0));
}

function percent(value: number, max: number) {
  return Math.max(6, Math.round((value / max) * 100));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTrendDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderLinePath(points: DashboardPoint[], key: 'hours' | 'billableHours') {
  if (points.length <= 1) {
    return '';
  }
  const values = points.map((point) => point[key] || 0);
  const max = Math.max(1, ...values);
  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - (((point[key] || 0) / max) * 100);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function buildPie(points: DashboardPoint[]) {
  const total = points.reduce((sum, point) => sum + (point.count || 0), 0) || 1;
  const palette = ['#090c9b', '#3066be', '#2f8f9d', '#e37a2b', '#d64545'];
  let current = 0;

  const segments = points.map((point, index) => {
    const start = current;
    const value = point.count || 0;
    current += (value / total) * 360;

    return {
      label: point.label,
      value,
      color: palette[index % palette.length],
      start,
      end: current,
    };
  });

  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`
    : 'conic-gradient(#dbe4f7 0deg 360deg)';

  return { gradient, segments };
}

export default function AdminDashboard({ token, onOpenJob, onOpenProfile }: Props) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminDashboard(token, days)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, days]);

  const employeeMax = useMemo(() => maxValue(data?.charts.timeByEmployee || [], 'hours'), [data?.charts.timeByEmployee]);
  const billableEmployeeMax = useMemo(() => maxValue(data?.charts.billableByEmployee || [], 'hours'), [data?.charts.billableByEmployee]);
  const jobHoursMax = useMemo(() => maxValue(data?.charts.hoursByJob || [], 'hours'), [data?.charts.hoursByJob]);
  const partsCostMax = useMemo(() => maxValue(data?.charts.partsCosts || [], 'cost'), [data?.charts.partsCosts]);
  const statusPie = useMemo(() => buildPie(data?.charts.jobsByStatus || []), [data?.charts.jobsByStatus]);
  const trendPoints = data?.charts.hoursTrend || [];
  const trendMax = useMemo(
    () => Math.max(1, ...trendPoints.map((point) => Math.max(point.hours || 0, point.billableHours || 0))),
    [trendPoints],
  );
  const trendAverage = useMemo(() => {
    if (!trendPoints.length) return 0;
    const total = trendPoints.reduce((sum, point) => sum + (point.hours || 0), 0);
    return Number((total / trendPoints.length).toFixed(2));
  }, [trendPoints]);
  const trendPeak = useMemo(() => {
    if (!trendPoints.length) return null;
    return [...trendPoints].sort((a, b) => (b.hours || 0) - (a.hours || 0))[0];
  }, [trendPoints]);
  const trackedValue = useMemo(
    () => formatCurrency((data?.totals.partsCost || 0) + ((data?.totals.billableHours || 0) * 125)),
    [data?.totals.billableHours, data?.totals.partsCost],
  );

  const trendAxisLabels = useMemo(() => {
    if (!trendPoints.length) return [] as string[];
    if (trendPoints.length <= 2) {
      return trendPoints.map((point) => formatTrendDate(point.label));
    }
    const first = formatTrendDate(trendPoints[0].label);
    const mid = formatTrendDate(trendPoints[Math.floor(trendPoints.length / 2)].label);
    const last = formatTrendDate(trendPoints[trendPoints.length - 1].label);
    return [first, mid, last];
  }, [trendPoints]);

  const scaleLabelMax = `${trendMax.toFixed(1)}h`;
  const scaleLabelMid = `${(trendMax / 2).toFixed(1)}h`;

  return (
    <section className="panel admin-panel">
      <div className="panel-heading-inline">
        <div>
          <p className="eyebrow">Admin Insights</p>
          <h2>Admin Dashboard</h2>
          <p className="panel-copy">A dispatch-first view of workload, labor, billable time, parts cost, and job throughput.</p>
        </div>

        <label className="admin-range-select">
          <span>Window</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {loading ? <p className="status-note">Loading dashboard metrics...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {data ? (
        <>
          <div className="metric-strip admin-metrics">
            <article><span>Jobs</span><strong>{data.totals.jobs}</strong></article>
            <article><span>Open jobs</span><strong>{data.totals.openJobs}</strong></article>
            <article><span>In progress</span><strong>{data.totals.inProgressJobs}</strong></article>
            <article><span>Unassigned</span><strong>{data.totals.unassignedJobs}</strong></article>
            <article><span>Entries</span><strong>{data.totals.timeEntries}</strong></article>
            <article><span>Logged hours</span><strong>{data.totals.loggedHours.toFixed(2)}</strong></article>
            <article><span>Billable hours</span><strong>{data.totals.billableHours.toFixed(2)}</strong></article>
            <article><span>Tracked value</span><strong>{trackedValue}</strong></article>
          </div>

          <div className="admin-charts-grid">
            <article className="admin-chart-card">
              <h3>Time by Employee</h3>
              <div className="admin-bars">
                {data.charts.timeByEmployee.length === 0 ? <p className="muted">No entries in this window.</p> : null}
                {data.charts.timeByEmployee.map((point) => (
                  <div className="admin-bar-row" key={`emp-${point.id}`}>
                    <button className="btn btn-link admin-bar-link" onClick={() => onOpenProfile(point.id)} type="button">{point.label}</button>
                    <div className="admin-bar-track">
                      <div className="admin-bar-fill" style={{ width: `${percent(point.hours || 0, employeeMax)}%` }} />
                    </div>
                    <div className="admin-bar-value">{(point.hours || 0).toFixed(2)}h</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-chart-card">
              <h3>Billable Hours by Technician</h3>
              <div className="admin-bars">
                {data.charts.billableByEmployee.length === 0 ? <p className="muted">No billable time in this window.</p> : null}
                {data.charts.billableByEmployee.map((point) => (
                  <div className="admin-bar-row" key={`bill-${point.id}`}>
                    <button className="btn btn-link admin-bar-link" onClick={() => onOpenProfile(point.id)} type="button">{point.label}</button>
                    <div className="admin-bar-track">
                      <div className="admin-bar-fill admin-bar-fill-alt" style={{ width: `${percent(point.hours || 0, billableEmployeeMax)}%` }} />
                    </div>
                    <div className="admin-bar-value">{(point.hours || 0).toFixed(2)}h</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-chart-card">
              <h3>Hours by Job</h3>
              <div className="admin-bars">
                {data.charts.hoursByJob.length === 0 ? <p className="muted">No job hours in this window.</p> : null}
                {data.charts.hoursByJob.map((point) => (
                  <div className="admin-bar-row" key={`job-${point.id}`}>
                    <div className="admin-bar-label">{point.label}</div>
                    <div className="admin-bar-track">
                      <div className="admin-bar-fill admin-bar-fill-alt" style={{ width: `${percent(point.hours || 0, jobHoursMax)}%` }} />
                    </div>
                    <div className="admin-bar-value">{(point.hours || 0).toFixed(2)}h</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-chart-card admin-chart-card--half">
              <h3>Parts Costs by Job</h3>
              <div className="admin-bars">
                {data.charts.partsCosts.length === 0 ? <p className="muted">No parts usage in this window.</p> : null}
                {data.charts.partsCosts.map((point) => (
                  <div className="admin-bar-row" key={`parts-${point.id}`}>
                    <div className="admin-bar-label">{point.label}</div>
                    <div className="admin-bar-track">
                      <div className="admin-bar-fill admin-bar-fill-warm" style={{ width: `${percent(point.cost || 0, partsCostMax)}%` }} />
                    </div>
                    <div className="admin-bar-value">{formatCurrency(point.cost || 0)}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-chart-card admin-chart-card--half">
              <h3>Jobs by Status</h3>
              <div className="pie-layout">
                <div className="pie-chart" style={{ backgroundImage: statusPie.gradient }} />
                <div className="pie-legend">
                  {statusPie.segments.map((segment) => (
                    <div className="pie-legend__item" key={segment.label}>
                      <span className="pie-legend__dot" style={{ backgroundColor: segment.color }} />
                      <span>{formatStatus(segment.label)}</span>
                      <strong>{segment.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="admin-chart-card admin-chart-card--full">
              <h3>Hours Trend</h3>
              {trendPoints.length === 0 ? <p className="muted">No time entries in this window.</p> : null}
              {trendPoints.length > 0 ? (
                <div className="line-chart">
                  <div className="line-chart__scale">
                    <span>{scaleLabelMax}</span>
                    <span>{scaleLabelMid}</span>
                    <span>0h</span>
                  </div>
                  <svg preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path className="line-chart__path line-chart__path--total" d={renderLinePath(trendPoints, 'hours')} />
                    <path className="line-chart__path line-chart__path--billable" d={renderLinePath(trendPoints, 'billableHours')} />
                  </svg>
                  <div className="line-chart__axis">
                    {trendAxisLabels.map((label) => (
                      <span key={`axis-${label}`}>{label}</span>
                    ))}
                  </div>
                  <div className="line-chart__legend">
                    <span>Total hours</span>
                    <span>Billable hours</span>
                  </div>
                  <div className="line-chart__summary">
                    <span>Average {trendAverage.toFixed(2)}h/day</span>
                    {trendPeak ? <span>Peak {formatTrendDate(trendPeak.label)} ({(trendPeak.hours || 0).toFixed(2)}h)</span> : null}
                  </div>
                </div>
              ) : null}
            </article>
          </div>

          <div className="data-table-wrap admin-jobs-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Hours</th>
                  <th>Billable</th>
                  <th>Parts</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => {
                  const assignedToId = job.assignedToId;

                  return (
                    <tr className="data-row-clickable" key={job.id}>
                      <td>
                        <button className="btn btn-link dashboard-job-link" onClick={() => onOpenJob(job.id)} type="button">
                          {job.label}
                        </button>
                        <div className="dashboard-job-subline">{job.customer} · P{job.priority}</div>
                      </td>
                      <td><span className={`status-chip status-${job.status}`}>{formatStatus(job.status)}</span></td>
                      <td>
                        {job.assignedTo && assignedToId != null ? (
                          <button className="btn btn-link dashboard-job-link" onClick={() => onOpenProfile(assignedToId)} type="button">
                            {job.assignedTo}
                          </button>
                        ) : (
                          'Unassigned'
                        )}
                      </td>
                      <td>{job.totalHours.toFixed(2)}h</td>
                      <td>{job.billableHours.toFixed(2)}h</td>
                      <td>{formatCurrency(job.partsCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
