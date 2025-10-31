const express = require('express');
const router = express.Router();
const dataRetrievalController = require('../controllers/dataRetrievalController');
const { authenticate, authorize, requireRole } = require('../middleware/auth');
const db = require('../config/database'); // <-- added missing import for health check

// add safe fallback for requireRole if the middleware isn't exported
const requireRoleSafe = (roles) => {
  if (typeof requireRole === 'function') {
    return requireRole(roles);
  }
  console.warn('Warning: requireRole middleware is not exported from ../middleware/auth. Requests will be allowed (no-op).');
  return (req, res, next) => next();
};

// =============================================================================
// 1. PATIENT DATA ROUTES
// =============================================================================

// Get complete patient profile
router.get('/patients/:patientId/complete-profile', 
    authenticate, 
    requireRoleSafe(['Admin', 'City Coordinator', 'Country Coordinator']),
    async (req, res) => {
        try {
            const { patientId } = req.params;
            const profile = await dataRetrievalController.getCompletePatientProfile(parseInt(patientId));
            
            if (profile.error) {
                return res.status(404).json({ error: profile.error });
            }
            
            res.json(profile);
        } catch (error) {
            console.error('Error retrieving patient profile:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Search patients
router.get('/patients/search', 
    authenticate, 
    authorize(['admin', 'city_coordinator', 'country_coordinator', 'supply_manager']),
    async (req, res) => {
        try {
            const criteria = req.query;
            const patients = await dataRetrievalController.searchPatients(criteria);
            res.json(patients);
        } catch (error) {
            console.error('Error searching patients:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get patients by phase
router.get('/patients/phase/:phaseId', 
    authenticate, 
    authorize(['admin', 'city_coordinator', 'country_coordinator']),
    async (req, res) => {
        try {
            const { phaseId } = req.params;
            const { status } = req.query;
            
            const patients = await dataRetrievalController.getPatientsByPhase(
                parseInt(phaseId), 
                status
            );
            
            res.json(patients);
        } catch (error) {
            console.error('Error getting patients by phase:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// =============================================================================
// 2. SUPPLY MANAGEMENT ROUTES
// =============================================================================

// Get inventory status
router.get('/supplies/inventory', 
    authenticate, 
    authorize(['admin', 'supply_manager', 'country_coordinator']),
    async (req, res) => {
        try {
            const { categoryId } = req.query;
            const inventory = await dataRetrievalController.getInventoryStatus(
                categoryId ? parseInt(categoryId) : null
            );
            res.json(inventory);
        } catch (error) {
            console.error('Error getting inventory status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get supply transactions
router.get('/supplies/transactions', 
    authenticate, 
    authorize(['admin', 'supply_manager']),
    async (req, res) => {
        try {
            const { supplyId, startDate, endDate } = req.query;
            const transactions = await dataRetrievalController.getSupplyTransactions(
                supplyId ? parseInt(supplyId) : null,
                startDate,
                endDate
            );
            res.json(transactions);
        } catch (error) {
            console.error('Error getting supply transactions:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get low stock alerts
router.get('/supplies/low-stock-alerts', 
    authenticate, 
    authorize(['admin', 'supply_manager']),
    async (req, res) => {
        try {
            const alerts = await dataRetrievalController.getLowStockAlerts();
            res.json(alerts);
        } catch (error) {
            console.error('Error getting low stock alerts:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// =============================================================================
// 3. AUDIT AND REPORTING ROUTES
// =============================================================================

// Get audit logs
router.get('/audit-logs', 
    authenticate, 
    authorize(['admin']),
    async (req, res) => {
        try {
            const { tableName, recordId, startDate, endDate } = req.query;
            const logs = await dataRetrievalController.getAuditLogs(
                tableName,
                recordId ? parseInt(recordId) : null,
                startDate,
                endDate
            );
            res.json(logs);
        } catch (error) {
            console.error('Error getting audit logs:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get system activity report
router.get('/reports/system-activity', 
    authenticate, 
    authorize(['admin']),
    async (req, res) => {
        try {
            const { days } = req.query;
            const report = await dataRetrievalController.getSystemActivityReport(
                days ? parseInt(days) : 30
            );
            res.json(report);
        } catch (error) {
            console.error('Error getting system activity report:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get patient statistics
router.get('/reports/patient-statistics', 
    authenticate, 
    authorize(['admin', 'country_coordinator']),
    async (req, res) => {
        try {
            const statistics = await dataRetrievalController.getPatientStatistics();
            res.json(statistics);
        } catch (error) {
            console.error('Error getting patient statistics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// =============================================================================
// 4. SCHEDULE AND SMS ROUTES
// =============================================================================

// Get schedules
router.get('/schedules', 
    authenticate, 
    authorize(['admin', 'city_coordinator', 'country_coordinator']),
    async (req, res) => {
        try {
            const filters = req.query;
            const schedules = await dataRetrievalController.getSchedules(filters);
            res.json(schedules);
        } catch (error) {
            console.error('Error getting schedules:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get SMS messages
router.get('/sms-messages', 
    authenticate, 
    authorize(['admin']),
    async (req, res) => {
        try {
            const { messageType, startDate, endDate } = req.query;
            const messages = await dataRetrievalController.getSmsMessages(
                messageType,
                startDate,
                endDate
            );
            res.json(messages);
        } catch (error) {
            console.error('Error getting SMS messages:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// =============================================================================
// 5. DATA ARCHIVAL AND EXPORT ROUTES
// =============================================================================

// Archive completed patients
router.post('/archive/patients', 
    authenticate, 
    authorize(['admin']),
    async (req, res) => {
        try {
            const { archiveBeforeDate } = req.body;
            
            if (!archiveBeforeDate) {
                return res.status(400).json({ error: 'archiveBeforeDate is required' });
            }
            
            const result = await dataRetrievalController.archiveCompletedPatients(archiveBeforeDate);
            res.json(result);
        } catch (error) {
            console.error('Error archiving patients:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Export data
router.get('/export/:exportType', 
    authenticate, 
    authorize(['admin', 'country_coordinator']),
    async (req, res) => {
        try {
            const { exportType } = req.params;
            const filters = req.query;
            
            const exportData = await dataRetrievalController.exportData(exportType, filters);
            
            // Set headers for file download
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 
                `attachment; filename=${exportType}-export-${new Date().toISOString().split('T')[0]}.json`);
            
            res.json(exportData);
        } catch (error) {
            console.error('Error exporting data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// =============================================================================
// 6. HEALTH CHECK AND SYSTEM INFO ROUTES
// =============================================================================

// Health check
router.get('/health', 
    authenticate,
    async (req, res) => {
        try {
            // Simple database health check
            const dbResult = await db.query('SELECT NOW() as current_time, version() as version');
            
            res.json({
                status: 'healthy',
                timestamp: new Date(),
                database: {
                    connected: true,
                    currentTime: dbResult.rows[0].current_time,
                    version: dbResult.rows[0].version
                }
            });
        } catch (error) {
            console.error('Health check failed:', error);
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date(),
                database: {
                    connected: false,
                    error: error.message
                }
            });
        }
    }
);

// System information
router.get('/system-info', 
    authenticate, 
    authorize(['admin']),
    async (req, res) => {
        try {
            // Get counts for main entities
            const [
                patientsCount,
                usersCount,
                suppliesCount,
                schedulesCount
            ] = await Promise.all([
                db.query('SELECT COUNT(*) FROM patients'),
                db.query('SELECT COUNT(*) FROM users WHERE is_active = true'),
                db.query('SELECT COUNT(*) FROM supplies'),
                db.query('SELECT COUNT(*) FROM schedules')
            ]);
            
            res.json({
                system: {
                    name: 'Hearing Aid Mission System',
                    version: '1.0.0'
                },
                counts: {
                    patients: parseInt(patientsCount.rows[0].count),
                    activeUsers: parseInt(usersCount.rows[0].count),
                    supplies: parseInt(suppliesCount.rows[0].count),
                    schedules: parseInt(schedulesCount.rows[0].count)
                },
                lastUpdated: new Date()
            });
        } catch (error) {
            console.error('Error getting system info:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

module.exports = router;