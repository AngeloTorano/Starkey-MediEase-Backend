const db = require('../config/database')
const path = require('path')
const fs = require('fs')

class DocumentController {
    
    /**
     * Get all documents with uploader information
     */
    async getAllDocuments(req, res) {
        try {
            
            const query = `
                SELECT 
                    md.*,
                    u.first_name as uploaded_by_first_name,
                    u.last_name as uploaded_by_last_name,
                    u.email as uploaded_by_email
                FROM mission_documents md
                JOIN users u ON md.uploaded_by = u.user_id
                ORDER BY md.created_at DESC
            `
            
            const result = await db.query(query)
            
            
            res.json({
                success: true,
                data: result.rows
            })
            
        } catch (error) {
            console.error('Error fetching documents:', error)
            res.status(500).json({
                success: false,
                message: 'Error fetching documents'
            })
        }
    }
    
    /**
     * Upload new document
     */
    /**
 * Upload new document
 */
async uploadDocument(req, res) {
    const client = await db.getClient()
    
    try {
        await client.query('BEGIN')
        
        const { title, description, version } = req.body

        // Check if file was uploaded
        if (!req.file) {
            await client.query('ROLLBACK')
            return res.status(400).json({
                success: false,
                message: 'No file uploaded. Please select a PDF file.'
            })
        }

        // Check if user is authenticated
        if (!req.user || !req.user.user_id) {
            await client.query('ROLLBACK')
            // Delete the uploaded file if validation fails
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path)
            }
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            })
        }

        // Validate required fields
        if (!title || !description || !version) {
            await client.query('ROLLBACK')
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path)
            }
            return res.status(400).json({
                success: false,
                message: 'Title, description, and version are required'
            })
        }

        // Validate version is a number
        const versionNum = parseInt(version)
        if (isNaN(versionNum) || versionNum < 1) {
            await client.query('ROLLBACK')
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path)
            }
            return res.status(400).json({
                success: false,
                message: 'Version must be a positive number'
            })
        }

        // Insert document record
        const insertQuery = `
            INSERT INTO mission_documents (
                title, 
                description, 
                version,
                file_name,
                original_name,
                file_path,
                file_size,
                file_type,
                uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `
        
        const values = [
            title,
            description,
            versionNum,
            req.file.filename,
            req.file.originalname,
            req.file.path,
            req.file.size,
            req.file.mimetype,
            req.user.user_id
        ]
        
        const result = await client.query(insertQuery, values)
        
        // Get the complete document with uploader info
        const getDocumentQuery = `
            SELECT 
                md.*,
                u.first_name as uploaded_by_first_name,
                u.last_name as uploaded_by_last_name,
                u.email as uploaded_by_email
            FROM mission_documents md
            JOIN users u ON md.uploaded_by = u.user_id
            WHERE md.document_id = $1
        `
        
        const documentResult = await client.query(getDocumentQuery, [result.rows[0].document_id])
        
        await client.query('COMMIT')
        
        
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            data: documentResult.rows[0]
        })
        
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('❌ Error uploading document:', error)
        
        // Delete the uploaded file if save fails
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path)
        }
        
        res.status(500).json({
            success: false,
            message: 'Error uploading document: ' + error.message
        })
    } finally {
        client.release()
    }
}
    
    /**
     * Download document
     */
    async downloadDocument(req, res) {
        try {
            const documentId = req.params.id
            
            const query = `
                SELECT * FROM mission_documents 
                WHERE document_id = $1
            `
            
            const result = await db.query(query, [documentId])
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Document not found'
                })
            }
            
            const document = result.rows[0]
            
            if (!fs.existsSync(document.file_path)) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on server'
                })
            }
            
            res.setHeader('Content-Type', document.file_type)
            res.setHeader('Content-Disposition', `attachment; filename="${document.original_name}"`)
            
            const fileStream = fs.createReadStream(document.file_path)
            fileStream.on('error', (error) => {
                console.error('Error streaming file:', error)
                res.status(500).json({
                    success: false,
                    message: 'Error downloading file'
                })
            })
            
            fileStream.pipe(res)
            
        } catch (error) {
            console.error('Error downloading document:', error)
            res.status(500).json({
                success: false,
                message: 'Error downloading document'
            })
        }
    }
    
    /**
     * Delete document
     */
    async deleteDocument(req, res) {
        const documentId = req.params.id
        
        const client = await db.getClient()
        
        try {
            await client.query('BEGIN')
            
            // Get document first to get file path
            const getQuery = `
                SELECT * FROM mission_documents 
                WHERE document_id = $1
            `
            
            const documentResult = await client.query(getQuery, [documentId])
            
            if (documentResult.rows.length === 0) {
                await client.query('ROLLBACK')
                return res.status(404).json({
                    success: false,
                    message: 'Document not found'
                })
            }
            
            // Delete from database
            const deleteQuery = `
                DELETE FROM mission_documents 
                WHERE document_id = $1
            `
            
            await client.query(deleteQuery, [documentId])
            
            await client.query('COMMIT')
            
            res.json({
                success: true,
                message: 'Document deleted successfully'
            })
            
        } catch (error) {
            await client.query('ROLLBACK')
            console.error('❌ Error deleting document:', error)
            res.status(500).json({
                success: false,
                message: 'Error deleting document'
            })
        } finally {
            client.release()
        }
    }
}

module.exports = new DocumentController()