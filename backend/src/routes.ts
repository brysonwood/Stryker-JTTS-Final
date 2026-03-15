import { Router } from 'express';
import authController from './controllers/authController';
import jobController from './controllers/jobController';
import mediaController from './controllers/mediaController';
import timeEntryController from './controllers/timeEntryController';
import customerController from './controllers/customerController';
import taskController from './controllers/taskController';
import partsController from './controllers/partsController';
import adminController from './controllers/adminController';
import invoiceController from './controllers/invoiceController';
import auditController from './controllers/auditController';
import userController from './controllers/userController';
import requireAuth, { requireRole } from './middleware/auth';
import { validateBody } from './middleware/validate';

const router = Router();

router.get('/', (req, res) => res.json({ message: 'Stryker JTTS API' }));

// Auth
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, (req, res) => res.json({ user: (req as any).user }));

// Customers
router.get('/customers', requireAuth, customerController.listCustomers);
router.post('/customers', requireAuth, requireRole('admin'), validateBody(['name']), customerController.createCustomer);

// Jobs
router.get('/jobs', requireAuth, jobController.listJobs);
router.post('/jobs', requireAuth, validateBody(['customerId', 'description']), jobController.createJob);
router.get('/jobs/:id', requireAuth, jobController.getJob);
router.patch('/jobs/:id', requireAuth, jobController.updateJob);

// Tasks (per job)
router.post('/jobs/:id/tasks', requireAuth, validateBody(['description']), taskController.createTask);
router.patch('/jobs/:id/tasks/:taskId', requireAuth, taskController.updateTask);

// Parts (per job)
router.get('/jobs/:id/parts', requireAuth, partsController.listParts);
router.post('/jobs/:id/parts', requireAuth, validateBody(['sku']), partsController.addPart);
router.delete('/jobs/:id/parts/:partId', requireAuth, partsController.deletePart);

// Media
router.post('/media/upload-init', requireAuth, mediaController.uploadInit);
router.post('/media/complete', requireAuth, mediaController.uploadComplete);
router.get('/media/:id', requireAuth, mediaController.getMedia);
router.delete('/media/:id', requireAuth, mediaController.deleteMedia);

// Time entries
router.get('/jobs/:id/time-entries', requireAuth, timeEntryController.listJobTimeEntries);
router.post('/time-entries', requireAuth, timeEntryController.createTimeEntry);
router.delete('/time-entries/:id', requireAuth, timeEntryController.deleteTimeEntry);

// Admin
router.get('/admin/dashboard', requireAuth, requireRole('admin'), adminController.getDashboard);
router.get('/admin/audit-logs', requireAuth, requireRole('admin'), auditController.listAuditLogs);
router.post('/admin/media/retention-cleanup', requireAuth, requireRole('admin'), adminController.runRetentionCleanup);

// User management - admin-only for list/create; profile changes check permissions in the controller.
router.get('/users', requireAuth, requireRole('admin'), userController.listUsers);
router.get('/users/:id/profile', requireAuth, userController.getUserProfile);
router.patch('/users/:id', requireAuth, userController.updateUserProfile);
router.post('/admin/users', requireAuth, requireRole('admin'), validateBody(['firstName', 'lastName', 'email', 'password']), userController.createUser);
router.patch('/admin/users/:id', requireAuth, requireRole('admin'), userController.updateUser);

// Invoices
router.get('/invoices/export', requireAuth, invoiceController.exportInvoiceDraft);
router.post('/invoices/pdf-jobs', requireAuth, invoiceController.enqueueInvoicePdf);
router.get('/invoices/pdf-jobs/:id', requireAuth, invoiceController.getInvoicePdfStatus);

export default router;
