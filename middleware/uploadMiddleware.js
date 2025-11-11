const multer = require('multer')
const path = require('path')
const fs = require('fs')

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/documents')

// Check directory permissions
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
    } else {
        
        // Test write permissions
        const testFile = path.join(uploadsDir, 'test-write-permission.tmp')
        try {
            fs.writeFileSync(testFile, 'test')
            fs.unlinkSync(testFile)
        } catch (error) {
            console.error('❌ Write permission error:', error.message)
        }
    }
    
} catch (error) {
    console.error('❌ Directory access error:', error.message)
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir)
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const fileExtension = path.extname(file.originalname)
        const filename = 'doc-' + uniqueSuffix + fileExtension
        cb(null, filename)
    }
})

const fileFilter = (req, file, cb) => { 
    // Allow only PDF files
    if (file.mimetype === 'application/pdf') {
        cb(null, true)
    } else {
        cb(new Error('Only PDF files are allowed'), false)
    }
}

// INCREASED FILE SIZE LIMIT - from 10MB to 50MB
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit (increased from 10MB)
    }
})

// Add error handling middleware for multer
const multerErrorHandler = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 50MB.' // Updated message
            })
        }
        return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`
        })
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        })
    }
    next()
}

// Export both upload and error handler
module.exports = {
    upload: upload,
    multerErrorHandler: multerErrorHandler
}