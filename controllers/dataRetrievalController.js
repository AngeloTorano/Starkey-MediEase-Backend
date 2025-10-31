const db = require('../config/database');

class DataRetrievalController {
    
    // =============================================================================
    // 1. PATIENT DATA RETRIEVAL METHODS
    // =============================================================================
    
    /**
     * Get complete patient profile with all phase data
     */
    async getCompletePatientProfile(patientId) {
        try {
            // Get basic patient info
            const patientQuery = `
                SELECT * FROM patients WHERE patient_id = $1
            `;
            const patientResult = await db.query(patientQuery, [patientId]);
            
            if (patientResult.rows.length === 0) {
                return { error: 'Patient not found' };
            }
            
            const patient = patientResult.rows[0];
            
            // Get phase progression
            const phasesQuery = `
                SELECT pp.*, p.phase_name, p.phase_description 
                FROM patient_phases pp 
                JOIN phases p ON pp.phase_id = p.phase_id 
                WHERE pp.patient_id = $1 
                ORDER BY pp.phase_id
            `;
            const phasesResult = await db.query(phasesQuery, [patientId]);
            
            // Get all phase-specific data
            const [
                phase1Reg,
                phase2Reg,
                phase3Reg,
                earScreenings,
                hearingScreenings,
                earImpressions,
                finalQcP1,
                finalQcP2,
                finalQcP3,
                fittingTable,
                fitting,
                counseling,
                aftercareAssessment
            ] = await Promise.all([
                this.getPhase1Data(patientId),
                this.getPhase2Data(patientId),
                this.getPhase3Data(patientId),
                this.getEarScreenings(patientId),
                this.getHearingScreenings(patientId),
                this.getEarImpressions(patientId),
                this.getFinalQcP1(patientId),
                this.getFinalQcP2(patientId),
                this.getFinalQcP3(patientId),
                this.getFittingTable(patientId),
                this.getFitting(patientId),
                this.getCounseling(patientId),
                this.getAftercareAssessment(patientId)
            ]);
            
            return {
                patient: patient,
                phaseProgression: phasesResult.rows,
                phase1: phase1Reg,
                phase2: phase2Reg,
                phase3: phase3Reg,
                earScreenings: earScreenings,
                hearingScreenings: hearingScreenings,
                earImpressions: earImpressions,
                qualityControl: {
                    phase1: finalQcP1,
                    phase2: finalQcP2,
                    phase3: finalQcP3
                },
                fitting: {
                    fittingTable: fittingTable,
                    fitting: fitting,
                    counseling: counseling
                },
                aftercare: aftercareAssessment
            };
            
        } catch (error) {
            console.error('Error retrieving complete patient profile:', error);
            throw error;
        }
    }
    
    /**
     * Search patients by various criteria
     */
    async searchPatients(criteria) {
        try {
            let query = `
                SELECT p.*, 
                    STRING_AGG(DISTINCT ph.phase_name, ', ') as current_phases,
                    MAX(pp.phase_start_date) as latest_phase_date
                FROM patients p
                LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
                LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (criteria.shf_id) {
                paramCount++;
                query += ` AND p.shf_id ILIKE $${paramCount}`;
                params.push(`%${criteria.shf_id}%`);
            }
            
            if (criteria.last_name) {
                paramCount++;
                query += ` AND p.last_name ILIKE $${paramCount}`;
                params.push(`%${criteria.last_name}%`);
            }
            
            if (criteria.first_name) {
                paramCount++;
                query += ` AND p.first_name ILIKE $${paramCount}`;
                params.push(`%${criteria.first_name}%`);
            }
            
            if (criteria.mobile_number) {
                paramCount++;
                query += ` AND (p.mobile_number ILIKE $${paramCount} OR p.alternative_number ILIKE $${paramCount})`;
                params.push(`%${criteria.mobile_number}%`);
            }
            
            if (criteria.city_village) {
                paramCount++;
                query += ` AND p.city_village ILIKE $${paramCount}`;
                params.push(`%${criteria.city_village}%`);
            }
            
            query += ` GROUP BY p.patient_id ORDER BY p.last_name, p.first_name`;
            
            if (criteria.limit) {
                query += ` LIMIT $${paramCount + 1}`;
                params.push(criteria.limit);
            }
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error searching patients:', error);
            throw error;
        }
    }
    
    /**
     * Get patients by phase status
     */
    async getPatientsByPhase(phaseId, status = null) {
        try {
            let query = `
                SELECT p.*, pp.phase_start_date, pp.phase_end_date, pp.status as phase_status,
                    u.first_name as completed_by_first_name, u.last_name as completed_by_last_name
                FROM patients p
                JOIN patient_phases pp ON p.patient_id = pp.patient_id
                LEFT JOIN users u ON pp.completed_by_user_id = u.user_id
                WHERE pp.phase_id = $1
            `;
            
            const params = [phaseId];
            
            if (status) {
                query += ` AND pp.status = $2`;
                params.push(status);
            }
            
            query += ` ORDER BY pp.phase_start_date DESC`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting patients by phase:', error);
            throw error;
        }
    }
    
    // =============================================================================
    // 2. PHASE-SPECIFIC DATA RETRIEVAL METHODS
    // =============================================================================
    
    async getPhase1Data(patientId) {
        const query = `SELECT * FROM phase1_registration_section WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getPhase2Data(patientId) {
        const query = `SELECT * FROM phase2_registration_section WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getPhase3Data(patientId) {
        const query = `SELECT * FROM phase3_registration_section WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getEarScreenings(patientId) {
        const query = `
            SELECT es.*, p.phase_name, u.first_name, u.last_name 
            FROM ear_screening es
            JOIN phases p ON es.phase_id = p.phase_id
            LEFT JOIN users u ON es.completed_by_user_id = u.user_id
            WHERE es.patient_id = $1 
            ORDER BY es.created_at
        `;
        const result = await db.query(query, [patientId]);
        return result.rows;
    }
    
    async getHearingScreenings(patientId) {
        const query = `
            SELECT hs.*, p.phase_name, u.first_name, u.last_name 
            FROM hearing_screening hs
            JOIN phases p ON hs.phase_id = p.phase_id
            LEFT JOIN users u ON hs.completed_by_user_id = u.user_id
            WHERE hs.patient_id = $1 
            ORDER BY hs.created_at
        `;
        const result = await db.query(query, [patientId]);
        return result.rows;
    }
    
    async getEarImpressions(patientId) {
        const query = `SELECT * FROM ear_impressions WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getFinalQcP1(patientId) {
        const query = `SELECT * FROM final_qc_p1 WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getFinalQcP2(patientId) {
        const query = `SELECT * FROM final_qc_p2 WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getFinalQcP3(patientId) {
        const query = `SELECT * FROM final_qc_p3 WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getFittingTable(patientId) {
        const query = `
            SELECT ft.*, u.first_name as fitter_first_name, u.last_name as fitter_last_name 
            FROM fitting_table ft
            LEFT JOIN users u ON ft.fitter_id = u.user_id
            WHERE ft.patient_id = $1
        `;
        const result = await db.query(query, [patientId]);
        return result.rows;
    }
    
    async getFitting(patientId) {
        const query = `
            SELECT f.*, u.first_name as fitter_first_name, u.last_name as fitter_last_name 
            FROM fitting f
            LEFT JOIN users u ON f.fitter_id = u.user_id
            WHERE f.patient_id = $1
        `;
        const result = await db.query(query, [patientId]);
        return result.rows;
    }
    
    async getCounseling(patientId) {
        const query = `SELECT * FROM counseling WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    async getAftercareAssessment(patientId) {
        const query = `SELECT * FROM aftercare_assessment WHERE patient_id = $1`;
        const result = await db.query(query, [patientId]);
        return result.rows[0] || null;
    }
    
    // =============================================================================
    // 3. SUPPLY MANAGEMENT DATA RETRIEVAL
    // =============================================================================
    
    /**
     * Get current inventory status
     */
    async getInventoryStatus(categoryId = null) {
        try {
            let query = `
                SELECT s.*, sc.category_name,
                    CASE 
                        WHEN s.current_stock_level <= s.reorder_level THEN 'Low Stock'
                        WHEN s.current_stock_level = 0 THEN 'Out of Stock'
                        ELSE 'In Stock'
                    END as stock_status
                FROM supplies s
                JOIN supply_categories sc ON s.category_id = sc.category_id
            `;
            
            const params = [];
            
            if (categoryId) {
                query += ` WHERE s.category_id = $1`;
                params.push(categoryId);
            }
            
            query += ` ORDER BY sc.category_name, s.item_name`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting inventory status:', error);
            throw error;
        }
    }
    
    /**
     * Get supply transaction history
     */
    async getSupplyTransactions(supplyId = null, startDate = null, endDate = null) {
        try {
            let query = `
                SELECT st.*, s.item_name, stt.type_name as transaction_type,
                    u.first_name, u.last_name
                FROM supply_transactions st
                JOIN supplies s ON st.supply_id = s.supply_id
                JOIN supply_transaction_types stt ON st.transaction_type_id = stt.transaction_type_id
                LEFT JOIN users u ON st.recorded_by_user_id = u.user_id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (supplyId) {
                paramCount++;
                query += ` AND st.supply_id = $${paramCount}`;
                params.push(supplyId);
            }
            
            if (startDate) {
                paramCount++;
                query += ` AND st.transaction_date >= $${paramCount}`;
                params.push(startDate);
            }
            
            if (endDate) {
                paramCount++;
                query += ` AND st.transaction_date <= $${paramCount}`;
                params.push(endDate);
            }
            
            query += ` ORDER BY st.transaction_date DESC`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting supply transactions:', error);
            throw error;
        }
    }
    
    /**
     * Get low stock alerts
     */
    async getLowStockAlerts() {
        try {
            const query = `
                SELECT s.*, sc.category_name,
                    (s.current_stock_level - s.reorder_level) as below_reorder_by
                FROM supplies s
                JOIN supply_categories sc ON s.category_id = sc.category_id
                WHERE s.current_stock_level <= s.reorder_level
                ORDER BY below_reorder_by ASC, sc.category_name, s.item_name
            `;
            
            const result = await db.query(query);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting low stock alerts:', error);
            throw error;
        }
    }
    
    // =============================================================================
    // 4. AUDIT AND REPORTING METHODS
    // =============================================================================
    
    /**
     * Get audit logs for specific table and record
     */
    async getAuditLogs(tableName = null, recordId = null, startDate = null, endDate = null) {
        try {
            let query = `
                SELECT al.*, u.first_name, u.last_name, u.username
                FROM audit_logs al
                LEFT JOIN users u ON al.changed_by_user_id = u.user_id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (tableName) {
                paramCount++;
                query += ` AND al.table_name = $${paramCount}`;
                params.push(tableName);
            }
            
            if (recordId) {
                paramCount++;
                query += ` AND al.record_id = $${paramCount}`;
                params.push(recordId);
            }
            
            if (startDate) {
                paramCount++;
                query += ` AND al.change_timestamp >= $${paramCount}`;
                params.push(startDate);
            }
            
            if (endDate) {
                paramCount++;
                query += ` AND al.change_timestamp <= $${paramCount}`;
                params.push(endDate);
            }
            
            query += ` ORDER BY al.change_timestamp DESC`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting audit logs:', error);
            throw error;
        }
    }
    
    /**
     * Get system activity report
     */
    async getSystemActivityReport(days = 30) {
        try {
            const query = `
                SELECT 
                    DATE(change_timestamp) as activity_date,
                    table_name,
                    action_type,
                    COUNT(*) as activity_count,
                    COUNT(DISTINCT changed_by_user_id) as unique_users
                FROM audit_logs 
                WHERE change_timestamp >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY DATE(change_timestamp), table_name, action_type
                ORDER BY activity_date DESC, activity_count DESC
            `;
            
            const result = await db.query(query);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting system activity report:', error);
            throw error;
        }
    }
    
    /**
     * Get patient statistics by phase and location
     */
    async getPatientStatistics() {
        try {
            const query = `
                SELECT 
                    -- Phase statistics
                    p.phase_name,
                    COUNT(pp.patient_id) as total_patients,
                    COUNT(CASE WHEN pp.status = 'Completed' THEN 1 END) as completed_patients,
                    COUNT(CASE WHEN pp.status = 'In Progress' THEN 1 END) as in_progress_patients,
                    
                    -- Location statistics
                    pt.region_district,
                    pt.city_village,
                    COUNT(DISTINCT pt.patient_id) as location_patients
                    
                FROM phases p
                LEFT JOIN patient_phases pp ON p.phase_id = pp.phase_id
                LEFT JOIN patients pt ON pp.patient_id = pt.patient_id
                GROUP BY p.phase_id, p.phase_name, pt.region_district, pt.city_village
                ORDER BY p.phase_id, total_patients DESC
            `;
            
            const result = await db.query(query);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting patient statistics:', error);
            throw error;
        }
    }
    
    // =============================================================================
    // 5. SCHEDULE AND SMS DATA RETRIEVAL
    // =============================================================================
    
    async getSchedules(filters = {}) {
        try {
            let query = `
                SELECT s.*, u.first_name as created_by_first_name, u.last_name as created_by_last_name
                FROM schedules s
                LEFT JOIN users u ON s.created_by_user_id = u.user_id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (filters.mission_name) {
                paramCount++;
                query += ` AND s.mission_name ILIKE $${paramCount}`;
                params.push(`%${filters.mission_name}%`);
            }
            
            if (filters.AfterCareCity) {
                paramCount++;
                query += ` AND s.AfterCareCity ILIKE $${paramCount}`;
                params.push(`%${filters.AfterCareCity}%`);
            }
            
            if (filters.start_date) {
                paramCount++;
                query += ` AND s.date >= $${paramCount}`;
                params.push(filters.start_date);
            }
            
            if (filters.end_date) {
                paramCount++;
                query += ` AND s.date <= $${paramCount}`;
                params.push(filters.end_date);
            }
            
            if (filters.status) {
                paramCount++;
                query += ` AND s.status = $${paramCount}`;
                params.push(filters.status);
            }
            
            query += ` ORDER BY s.date DESC, s.time DESC`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting schedules:', error);
            throw error;
        }
    }
    
    async getSmsMessages(messageType = null, startDate = null, endDate = null) {
        try {
            let query = `
                SELECT * FROM sms_messages 
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (messageType) {
                paramCount++;
                query += ` AND message_type = $${paramCount}`;
                params.push(messageType);
            }
            
            if (startDate) {
                paramCount++;
                query += ` AND created_at >= $${paramCount}`;
                params.push(startDate);
            }
            
            if (endDate) {
                paramCount++;
                query += ` AND created_at <= $${paramCount}`;
                params.push(endDate);
            }
            
            query += ` ORDER BY created_at DESC`;
            
            const result = await db.query(query, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error getting SMS messages:', error);
            throw error;
        }
    }
    
    // =============================================================================
    // 6. DATA ARCHIVAL METHODS
    // =============================================================================
    
    /**
     * Archive completed patient records (older than specified date)
     */
    async archiveCompletedPatients(archiveBeforeDate) {
        try {
            // Start transaction
            await db.query('BEGIN');
            
            // Get patients to archive
            const getPatientsQuery = `
                SELECT DISTINCT p.patient_id 
                FROM patients p
                JOIN patient_phases pp ON p.patient_id = pp.patient_id
                WHERE pp.status = 'Completed' 
                AND pp.phase_end_date < $1
                AND pp.phase_id = 3  -- Phase 3 completed
            `;
            
            const patientsResult = await db.query(getPatientsQuery, [archiveBeforeDate]);
            const patientIds = patientsResult.rows.map(row => row.patient_id);
            
            if (patientIds.length === 0) {
                await db.query('ROLLBACK');
                return { archived: 0, message: 'No patients found to archive' };
            }
            
            // Create archival records (you would create archival tables first)
            // This is a simplified example - in practice, you'd copy data to archival tables
            
            // Update patient status to archived
            const updateQuery = `
                UPDATE patients 
                SET is_archived = TRUE, 
                    archived_at = CURRENT_TIMESTAMP 
                WHERE patient_id = ANY($1)
            `;
            
            await db.query(updateQuery, [patientIds]);
            
            await db.query('COMMIT');
            
            return { 
                archived: patientIds.length, 
                patientIds: patientIds,
                message: `Successfully archived ${patientIds.length} patients` 
            };
            
        } catch (error) {
            await db.query('ROLLBACK');
            console.error('Error archiving patients:', error);
            throw error;
        }
    }
    
    /**
     * Export data for reporting purposes
     */
    async exportData(exportType, filters = {}) {
        try {
            let data;
            
            switch (exportType) {
                case 'patients':
                    data = await this.exportPatientData(filters);
                    break;
                case 'supplies':
                    data = await this.exportSupplyData(filters);
                    break;
                case 'audit':
                    data = await this.exportAuditData(filters);
                    break;
                case 'schedules':
                    data = await this.exportScheduleData(filters);
                    break;
                default:
                    throw new Error('Invalid export type');
            }
            
            return {
                exportType: exportType,
                generatedAt: new Date(),
                recordCount: data.length,
                data: data
            };
            
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }
    
    async exportPatientData(filters) {
        // Implementation for patient data export
        const query = `
            SELECT 
                p.*,
                STRING_AGG(DISTINCT ph.phase_name, ', ') as completed_phases,
                MAX(pp.phase_end_date) as latest_completion_date
            FROM patients p
            LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
            LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
            WHERE pp.status = 'Completed'
            GROUP BY p.patient_id
            ORDER BY p.last_name, p.first_name
        `;
        
        const result = await db.query(query);
        return result.rows;
    }
    
    async exportSupplyData(filters) {
        // Implementation for supply data export
        const query = `
            SELECT 
                s.*,
                sc.category_name,
                COALESCE(SUM(CASE WHEN st.transaction_type_id = 1 THEN st.quantity ELSE 0 END), 0) as total_received,
                COALESCE(SUM(CASE WHEN st.transaction_type_id = 2 THEN st.quantity ELSE 0 END), 0) as total_used
            FROM supplies s
            JOIN supply_categories sc ON s.category_id = sc.category_id
            LEFT JOIN supply_transactions st ON s.supply_id = st.supply_id
            GROUP BY s.supply_id, sc.category_name
            ORDER BY sc.category_name, s.item_name
        `;
        
        const result = await db.query(query);
        return result.rows;
    }
    
    async exportAuditData(filters) {
        // Implementation for audit data export
        return await this.getAuditLogs(
            filters.tableName, 
            filters.recordId, 
            filters.startDate, 
            filters.endDate
        );
    }
    
    async exportScheduleData(filters) {
        // Implementation for schedule data export
        return await this.getSchedules(filters);
    }
}

module.exports = new DataRetrievalController();