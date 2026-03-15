#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

const workspaceEnvPath = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(workspaceEnvPath)) {
  dotenv.config({ path: workspaceEnvPath });
}

if (!process.env.DATABASE_URL) {
  const configuredHost = process.env.DATABASE_HOST || 'localhost';
  const host = configuredHost === 'postgres' ? 'localhost' : configuredHost;
  const port = process.env.DATABASE_PORT || '5432';
  const database = process.env.DATABASE_NAME || 'stryker_jtts';
  const user = encodeURIComponent(process.env.DATABASE_USER || 'stryk_user');
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD || 'stryk_pass');
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (err) {
  console.error('Missing @prisma/client. Run `npm install` and `npx prisma generate` then retry.');
  process.exit(1);
}

const prisma = new PrismaClient();

const allowedUsers = [
  { firstName: 'Admin', lastName: 'User', email: 'admin@example.local', password: 'AdminPass123!', role: 'admin' },
  { firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@example.local', password: 'TechPass1!', role: 'user' },
  { firstName: 'Ethan', lastName: 'Clark', email: 'ethan.clark@example.local', password: 'TechPass1!', role: 'user' },
  { firstName: 'Noah', lastName: 'Patel', email: 'noah.patel@example.local', password: 'TechPass1!', role: 'user' },
];

function deriveNameParts(email) {
  const localPart = String(email || '').split('@')[0] || 'user';
  const rawParts = localPart.split(/[._-]+/).filter(Boolean);
  const [firstRaw = 'User', lastRaw = ''] = rawParts;
  const toTitle = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '');
  return { firstName: toTitle(firstRaw), lastName: toTitle(lastRaw) };
}

const customerFixtures = [
  { name: 'Western Marine Charter Services', billing: 'Pier 38, Seattle WA 98134' },
  { name: 'PMG Offshore Support Fleet', billing: '901 Harbor Island Blvd, Seattle WA 98134' },
  { name: 'Great Lakes Ferry Operations', billing: '1 Ferry Terminal Dr, Muskegon MI 49440' },
  { name: 'North Pacific Fisheries Cooperative', billing: '220 Dockside Ave, Dutch Harbor AK 99692' },
  { name: 'Harbor Tug and Barge Company', billing: '77 Terminal Way, Tacoma WA 98421' },
];

const legacyCustomerNames = [
  'ACME Industrial',
  'Meridian HVAC',
  'North Star Logistics',
  'ACME Corp',
  'Smoke Customer',
  'Westfield Medical Pavilion',
  'Lakefront Logistics Distribution Center',
  'North River Foods Processing Plant',
  'Cedar Grove Office Campus',
];

async function deleteJobCascade(jobId) {
  const invoices = await prisma.invoice.findMany({ where: { jobId }, select: { id: true } });
  if (invoices.length) {
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoices.map((invoice) => invoice.id) } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoices.map((invoice) => invoice.id) } } });
  }

  await prisma.photo.deleteMany({ where: { jobId } });
  await prisma.timeEntry.deleteMany({ where: { jobId } });
  await prisma.part.deleteMany({ where: { jobId } });
  await prisma.task.deleteMany({ where: { jobId } });
  await prisma.job.delete({ where: { id: jobId } });
}

async function purgeGeneratedArtifacts() {
  const generatedCustomers = await prisma.customer.findMany({
    where: {
      OR: [
        ...legacyCustomerNames.map((name) => ({ name })),
        { name: { startsWith: 'Smoke Customer' } },
        { name: { startsWith: 'Automation Validation Customer' } },
        { name: { startsWith: 'RBAC-check-' } },
      ],
    },
    select: { id: true },
  });

  for (const customer of generatedCustomers) {
    const jobs = await prisma.job.findMany({ where: { customerId: customer.id }, select: { id: true } });
    for (const job of jobs) {
      await deleteJobCascade(job.id);
    }
    await prisma.location.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  const generatedJobs = await prisma.job.findMany({
    where: {
      OR: [
        { description: { startsWith: 'Smoke Job' } },
        { description: { startsWith: 'Automation Validation Work Order' } },
        { description: { startsWith: 'Navigation Equipment:' } },
        { description: { startsWith: 'Navigateion Equipemnt:' } },
        { description: { startsWith: 'Communication Equipment:' } },
        { description: { startsWith: 'Commercial Safety Gear:' } },
        { description: { startsWith: 'Marine Hardware:' } },
        { description: { startsWith: 'Lighting, Spotlights and Electrical:' } },
        { description: { startsWith: 'Electronics Repair Shop:' } },
        { description: { startsWith: 'Refrigeration:' } },
        { description: { startsWith: 'Hydraulics:' } },
        { description: { startsWith: 'Plumbing:' } },
        { description: { startsWith: 'Maintenance & Painting:' } },
        { description: { startsWith: 'Controls, Pilots & Steering:' } },
        { description: { startsWith: 'Engine & Drive Parts:' } },
        { description: { startsWith: 'Propulsion:' } },
        { description: { startsWith: 'Storage:' } },
        { description: { startsWith: 'Parts Delivery:' } },
      ],
    },
    select: { id: true },
  });

  for (const job of generatedJobs) {
    await deleteJobCascade(job.id);
  }
}

async function normalizeSeedUsers() {
  const allowedEmailSet = new Set(allowedUsers.map((user) => user.email));
  const removableUsers = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'admin@example.com',
          'alice.technician@example.local',
          'bob.field@example.local',
          'carol.senior@example.local',
        ],
      },
    },
    select: { id: true, email: true },
  });

  const adminAccount = allowedUsers[0];
  const admin = await upsertUser(adminAccount);

  for (const user of removableUsers) {
    if (allowedEmailSet.has(user.email)) continue;
    await prisma.job.updateMany({ where: { assignedToId: user.id }, data: { assignedToId: null } });
    await prisma.photo.updateMany({ where: { uploaderId: user.id }, data: { uploaderId: admin.id } });
    await prisma.timeEntry.updateMany({ where: { userId: user.id }, data: { userId: admin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  return admin;
}

async function upsertUser(userData) {
  const { firstName, lastName, email, password, role } = userData;
  const hashed = bcrypt.hashSync(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({ where: { email }, data: { firstName, lastName, password: hashed, role, disabled: false } });
  }
  return prisma.user.create({ data: { firstName, lastName, email, password: hashed, role } });
}

async function upsertCustomer(name, billing) {
  const existing = await prisma.customer.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.customer.create({ data: { name, billing } });
}

async function upsertJob(customerId, description, opts = {}) {
  const existing = await prisma.job.findFirst({ where: { description, customerId } });
  if (existing) {
    return prisma.job.update({ where: { id: existing.id }, data: { ...opts } });
  }
  return prisma.job.create({ data: { customerId, description, ...opts } });
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const adminNames = deriveNameParts(adminEmail);

  await purgeGeneratedArtifacts();

  // ── Users ────────────────────────────────────────────────
  const normalizedAdmin = await normalizeSeedUsers();
  const admin = normalizedAdmin.email === adminEmail
    ? await prisma.user.update({ where: { id: normalizedAdmin.id }, data: { firstName: adminNames.firstName, lastName: adminNames.lastName || 'User', password: bcrypt.hashSync(adminPassword, 10), role: 'admin', disabled: false } })
    : await upsertUser({ firstName: adminNames.firstName, lastName: adminNames.lastName || 'User', email: adminEmail, password: adminPassword, role: 'admin' });
  const maria = await upsertUser({ firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@example.local', password: 'TechPass1!', role: 'user' });
  const ethan = await upsertUser({ firstName: 'Ethan', lastName: 'Clark', email: 'ethan.clark@example.local', password: 'TechPass1!', role: 'user' });
  const noah = await upsertUser({ firstName: 'Noah', lastName: 'Patel', email: 'noah.patel@example.local', password: 'TechPass1!', role: 'user' });
  console.log('Users seeded:', [admin.email, maria.email, ethan.email, noah.email].join(', '));

  const technicians = [maria, ethan, noah];

  // ── Customers ────────────────────────────────────────────
  const customersByName = {};
  for (const customer of customerFixtures) {
    customersByName[customer.name] = await upsertCustomer(customer.name, customer.billing);
  }
  console.log('Customers seeded:', Object.values(customersByName).map((customer) => customer.name).join(', '));

  // ── Jobs ─────────────────────────────────────────────────
  const jobFixtures = [
    {
      key: 'nav',
      customer: 'Western Marine Charter Services',
      description: 'Furuno TZtouch3 MFD and JRC JMA radar network integration on MV Pacific Crest',
      priority: 1,
      status: 'in_progress',
      estimatedHours: 14,
      assignedToId: ethan.id,
    },
    {
      key: 'comms',
      customer: 'PMG Offshore Support Fleet',
      description: 'Icom IC-M605 VHF and AIS base station replacement on OSV Meridian',
      priority: 2,
      status: 'open',
      estimatedHours: 8,
      assignedToId: maria.id,
    },
    {
      key: 'safety',
      customer: 'Great Lakes Ferry Operations',
      description: 'SOLAS life raft canister re-certification and EPIRB replacement audit',
      priority: 2,
      status: 'open',
      estimatedHours: 6,
      assignedToId: null,
    },
    {
      key: 'hardware',
      customer: 'Harbor Tug and Barge Company',
      description: 'Samson mooring winch brake rebuild and deck fairlead replacement',
      priority: 2,
      status: 'in_progress',
      estimatedHours: 10,
      assignedToId: noah.id,
    },
    {
      key: 'lighting',
      customer: 'North Pacific Fisheries Cooperative',
      description: 'Golight spotlight retrofit and panel breaker balancing',
      priority: 3,
      status: 'open',
      estimatedHours: 7,
      assignedToId: maria.id,
    },
    {
      key: 'repair',
      customer: 'Western Marine Charter Services',
      description: 'Bench repair of Furuno DFF3 sounder module and NMEA gateway diagnostics',
      priority: 2,
      status: 'complete',
      estimatedHours: 5,
      assignedToId: ethan.id,
    },
    {
      key: 'refrig',
      customer: 'Great Lakes Ferry Operations',
      description: 'Dometic cold-room compressor replacement and refrigerant recharge',
      priority: 1,
      status: 'in_progress',
      estimatedHours: 12,
      assignedToId: noah.id,
    },
    {
      key: 'hydro',
      customer: 'Harbor Tug and Barge Company',
      description: 'Parker steering ram seal kit installation and system pressure tuning',
      priority: 2,
      status: 'open',
      estimatedHours: 9,
      assignedToId: null,
    },
    {
      key: 'plumb',
      customer: 'North Pacific Fisheries Cooperative',
      description: 'Freshwater manifold leak remediation and Groco pump replacement',
      priority: 3,
      status: 'open',
      estimatedHours: 6,
      assignedToId: maria.id,
    },
    {
      key: 'maint',
      customer: 'Western Marine Charter Services',
      description: 'Corrosion prep, primer, and topside touch-up around electronics mast base',
      priority: 4,
      status: 'complete',
      estimatedHours: 11,
      assignedToId: noah.id,
    },
    {
      key: 'controls',
      customer: 'PMG Offshore Support Fleet',
      description: 'Simrad autopilot calibration and pilot pump commissioning',
      priority: 1,
      status: 'open',
      estimatedHours: 8,
      assignedToId: ethan.id,
    },
    {
      key: 'engine',
      customer: 'Great Lakes Ferry Operations',
      description: 'Starter motor and alternator replacement on CAT C18 auxiliary engine',
      priority: 1,
      status: 'in_progress',
      estimatedHours: 7,
      assignedToId: maria.id,
    },
    {
      key: 'propulsion',
      customer: 'Harbor Tug and Barge Company',
      description: 'Shaft coupling alignment verification and thrust bearing inspection',
      priority: 2,
      status: 'open',
      estimatedHours: 9,
      assignedToId: noah.id,
    },
    {
      key: 'storage',
      customer: 'North Pacific Fisheries Cooperative',
      description: 'Victron lithium battery bank installation with Magnum inverter to Outback charger migration',
      priority: 1,
      status: 'open',
      estimatedHours: 16,
      assignedToId: ethan.id,
    },
    {
      key: 'delivery',
      customer: 'PMG Offshore Support Fleet',
      description: 'Urgent dockside delivery and install of Furuno transducer, alternator belt kits, and hydraulic hoses',
      priority: 2,
      status: 'complete',
      estimatedHours: 4,
      assignedToId: maria.id,
    },
  ];

  const jobsByKey = {};
  for (const fixture of jobFixtures) {
    const customer = customersByName[fixture.customer];
    jobsByKey[fixture.key] = await upsertJob(customer.id, fixture.description, {
      priority: fixture.priority,
      status: fixture.status,
      estimatedHours: fixture.estimatedHours,
      assignedToId: fixture.assignedToId,
    });
  }
  console.log('Jobs seeded:', Object.values(jobsByKey).map((job) => job.id).join(', '));

  // ── Tasks ────────────────────────────────────────────────
  async function upsertTask(jobId, description, opts = {}) {
    const ex = await prisma.task.findFirst({ where: { jobId, description } });
    if (ex) return ex;
    return prisma.task.create({ data: { jobId, description, ...opts } });
  }

  const taskFixtures = [
    ['nav', 'Install and network Furuno TZT3 bridge display', 5, 'in_progress'],
    ['nav', 'Configure JRC radar guard zones and MARPA targets', 4, 'open'],
    ['comms', 'Replace Icom M605 control head and antenna feed', 3, 'open'],
    ['comms', 'Program MMSI, DSC contact set, and perform radio check', 2, 'open'],
    ['safety', 'Inspect and tag SOLAS life rafts and hydrostatic releases', 3, 'open'],
    ['safety', 'Replace expired EPIRB battery and verify self-test log', 2, 'open'],
    ['hardware', 'Rebuild mooring winch brake stack and torque test', 5, 'in_progress'],
    ['hardware', 'Replace starboard chock and inspect welds', 2, 'open'],
    ['lighting', 'Install Golight LED spotlight and helm controls', 3, 'open'],
    ['lighting', 'Balance electrical panel loads and thermal scan breakers', 2, 'open'],
    ['repair', 'Bench-test repaired Furuno DFF3 board under load', 2, 'complete'],
    ['repair', 'Update NMEA gateway firmware and validate sentence output', 2, 'complete'],
    ['refrig', 'Replace compressor and brazed filter-drier assembly', 5, 'in_progress'],
    ['refrig', 'Evacuate and recharge system to spec with leak check', 4, 'open'],
    ['hydro', 'Install Parker ram seal kit and bleed helm circuit', 4, 'open'],
    ['hydro', 'Verify relief valve setting and steering response', 3, 'open'],
    ['plumb', 'Replace Groco pump and freshwater manifold valves', 3, 'open'],
    ['plumb', 'Pressure-test freshwater distribution and document leaks', 2, 'open'],
    ['maint', 'Prep and paint mast base and cable trays', 6, 'complete'],
    ['maint', 'Apply epoxy topcoat at bridge wiring chase', 3, 'complete'],
    ['controls', 'Calibrate Simrad autopilot rudder feedback', 3, 'open'],
    ['controls', 'Sea-trial pilot gain and heading hold performance', 3, 'open'],
    ['engine', 'Replace starter motor and inspect ring gear teeth', 3, 'in_progress'],
    ['engine', 'Replace alternator and verify charging voltage curve', 3, 'open'],
    ['propulsion', 'Check shaft alignment and adjust coupling shims', 4, 'open'],
    ['propulsion', 'Inspect thrust bearing and oil condition', 3, 'open'],
    ['storage', 'Install Victron LiFePO4 bank and battery management bus', 7, 'open'],
    ['storage', 'Migrate Magnum inverter wiring to Outback control panel', 6, 'open'],
    ['delivery', 'Deliver urgent alternator and Furuno transducer kit dockside', 1, 'complete'],
    ['delivery', 'Complete parts handoff signoff and install verification', 1, 'complete'],
  ];

  for (const [jobKey, description, estimatedHrs, status] of taskFixtures) {
    await upsertTask(jobsByKey[jobKey].id, description, { estimatedHrs, status });
  }
  console.log('Tasks seeded');

  // ── Time Entries ─────────────────────────────────────────
  async function upsertTimeEntry(userId, jobId, startIso, endIso, notes, billable = true) {
    const start = new Date(startIso);
    const end   = new Date(endIso);
    const duration = Math.round((end - start) / 60000);
    const ex = await prisma.timeEntry.findFirst({ where: { userId, jobId, start } });
    if (ex) return ex;
    return prisma.timeEntry.create({ data: { userId, jobId, start, end, duration, notes, billable } });
  }

  const d = (daysAgo, h, m = 0) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - daysAgo);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  };

  const timeFixtures = [
    [maria.id, 'comms', 5, 8, 11, 0, 'Installed Icom M605 base and completed DSC configuration', true],
    [maria.id, 'lighting', 4, 9, 12, 0, 'Mounted Golight spotlight and tested helm controls', true],
    [maria.id, 'engine', 3, 7, 10, 0, 'Starter and alternator replacement prep and fitment', true],
    [maria.id, 'delivery', 2, 13, 15, 0, 'Delivered urgent parts and closed dockside handoff', true],

    [ethan.id, 'nav', 4, 8, 12, 0, 'Configured Furuno and JRC network on bridge console', true],
    [ethan.id, 'nav', 3, 9, 11, 30, 'Verified radar overlays and route data sync', true],
    [ethan.id, 'controls', 2, 7, 10, 0, 'Calibrated Simrad autopilot and rudder feedback', true],
    [ethan.id, 'storage', 1, 8, 12, 0, 'Victron bank commissioning and inverter switchover planning', true],

    [noah.id, 'hardware', 6, 8, 12, 0, 'Rebuilt mooring winch brake and checked heat rise', true],
    [noah.id, 'refrig', 3, 8, 13, 0, 'Compressor replacement and initial vacuum pull', true],
    [noah.id, 'propulsion', 2, 10, 13, 0, 'Shaft coupling alignment and bearing inspection', true],
    [noah.id, 'maint', 10, 8, 12, 0, 'Completed corrosion prep and paint system application', true],

    [admin.id, 'safety', 1, 14, 15, 0, 'Reviewed safety audit checklist with vessel chief engineer', false],
    [admin.id, 'hydro', 1, 15, 16, 0, 'Coordinated Parker seal kit availability with supplier', false],
    [admin.id, 'plumb', 2, 14, 15, 30, 'Approved Groco pump substitution due to lead time', false],
  ];

  for (const [userId, jobKey, daysAgo, startHour, endHour, endMinute, notes, billable] of timeFixtures) {
    await upsertTimeEntry(
      userId,
      jobsByKey[jobKey].id,
      d(daysAgo, startHour),
      d(daysAgo, endHour, endMinute),
      notes,
      billable,
    );
  }
  console.log('Time entries seeded');

  // ── Parts ────────────────────────────────────────────────
  async function upsertPart(jobId, sku, description, quantity, unitPrice, taxFlag = false) {
    const ex = await prisma.part.findFirst({ where: { jobId, sku } });
    if (ex) return ex;
    return prisma.part.create({ data: { jobId, sku, description, quantity, unitPrice, taxFlag } });
  }

  const partFixtures = [
    ['nav', 'FUR-TZT3-16', 'Furuno TZtouch3 16in multifunction display', 1, 6195.00, true],
    ['nav', 'JRC-JMA-9100', 'JRC radar scanner and processor kit', 1, 7450.00, true],
    ['comms', 'ICOM-M605', 'Icom IC-M605 fixed-mount VHF', 1, 899.00, true],
    ['comms', 'MCM-AIS-TRX', 'Class A AIS transceiver with GPS puck', 1, 1490.00, true],
    ['safety', 'ACR-EPIRB-950', 'ACR GlobalFix EPIRB beacon', 2, 749.00, true],
    ['safety', 'SOLAS-HYD-RELEASE', 'Hydrostatic release units for life rafts', 4, 129.00, false],
    ['hardware', 'SAMSON-BRK-KIT', 'Samson winch brake rebuild kit', 1, 1325.00, true],
    ['hardware', '316-FAIRLEAD-10', '316 stainless fairlead assembly', 2, 340.00, true],
    ['lighting', 'GOLIGHT-STRYKER', 'Golight marine spotlight with wireless remote', 1, 575.00, true],
    ['lighting', 'BLUESEA-BRK-30A', 'Blue Sea 30A magnetic breaker', 4, 49.00, false],
    ['repair', 'FUR-DFF3-CAPKIT', 'Furuno DFF3 repair capacitor kit', 1, 94.00, false],
    ['repair', 'NMEA-2000-BACKBONE', 'NMEA 2000 backbone diagnostic harness', 1, 180.00, false],
    ['refrig', 'DOM-COMP-24V', 'Dometic 24V refrigeration compressor', 1, 1380.00, true],
    ['refrig', 'R134A-REFILL', 'R134a refrigerant cylinder and manifold kit', 1, 295.00, true],
    ['hydro', 'PARKER-SEAL-RAM', 'Parker steering ram seal and gland kit', 1, 460.00, true],
    ['hydro', 'HYD-HOSE-34-ASSY', 'Hydraulic hose assembly 3/4in', 2, 189.00, true],
    ['plumb', 'GROCO-PMP-1240', 'Groco freshwater pressure pump', 1, 520.00, true],
    ['plumb', 'PEX-MANIFOLD-8', 'Marine manifold block 8-port', 1, 240.00, false],
    ['maint', 'INTERNATIONAL-PRIMER', 'International marine epoxy primer 5L', 2, 210.00, false],
    ['maint', 'TOPCOAT-PU-WHT', 'Polyurethane topcoat white 5L', 2, 235.00, false],
    ['controls', 'SIMRAD-AP44', 'Simrad AP44 autopilot controller', 1, 1890.00, true],
    ['controls', 'SIMRAD-RUDDER-FB', 'Rudder feedback sensor assembly', 1, 395.00, true],
    ['engine', 'DELCO-STARTER-C18', 'Starter motor for CAT C18', 1, 1160.00, true],
    ['engine', 'LEECE-ALT-24V', '24V marine alternator 140A', 1, 980.00, true],
    ['propulsion', 'COUPLING-SHIM-KIT', 'Propulsion shaft coupling shim kit', 1, 165.00, false],
    ['propulsion', 'THRUST-BRG-KIT', 'Thrust bearing service kit', 1, 740.00, true],
    ['storage', 'VICTRON-LFP-300AH', 'Victron LiFePO4 battery module 300Ah', 4, 1895.00, true],
    ['storage', 'MAGNUM-MSH3012', 'Magnum inverter/charger MSH3012', 1, 2495.00, true],
    ['storage', 'OUTBACK-MATE3S', 'Outback MATE3s monitoring and control panel', 1, 525.00, true],
    ['delivery', 'FUR-TRANS-2KW', 'Furuno transducer 2kW bronze thru-hull', 1, 1540.00, true],
    ['delivery', 'ALT-BELT-KIT-C18', 'Alternator belt service kit for CAT C18', 2, 112.00, false],
  ];

  for (const [jobKey, sku, description, quantity, unitPrice, taxFlag] of partFixtures) {
    await upsertPart(jobsByKey[jobKey].id, sku, description, quantity, unitPrice, taxFlag);
  }
  console.log('Parts seeded');

  console.log('\n=== Seed complete ===');
  console.log('  Admin:  ', adminEmail, '/', adminPassword);
  console.log('  Users:  maria.garcia@example.local, ethan.clark@example.local, noah.patel@example.local  /  TechPass1!');
  console.log('  Customers:', Object.values(customersByName).map((customer) => customer.name).join(' | '));
  console.log('  Jobs:   ', Object.keys(jobsByKey).length, 'jobs seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
