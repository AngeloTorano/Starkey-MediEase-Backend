# Healthcare Management System Backend

A secure Node.js/Express backend for healthcare patient management with role-based authorization and encrypted responses.

## Features

- **Role-based Access Control**: Admin, City Coordinator, Country Coordinator, Supply Manager
- **JWT Authentication**: Secure token-based authentication
- **Data Encryption**: All sensitive responses are encrypted
- **Audit Logging**: Complete audit trail for all data changes
- **Location-based Access**: Users can only access data for their assigned locations
- **Supply Management**: Inventory tracking with transaction history
- **Phase Management**: 3-phase patient care workflow

## Setup

1. **Install Dependencies**
\`\`\`bash
npm install
\`\`\`

2. **Environment Configuration**
Copy `.env.example` to `.env` and configure:
\`\`\`bash
cp .env.example .env
\`\`\`

3. **Database Setup**
- Create PostgreSQL database
- Run the initialization script: `scripts/init-database.sql`

4. **Start Server**
\`\`\`bash
# Development
npm run dev

# Production
npm start
\`\`\`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### User Management (Admin only)
- `POST /api/users` - Create new user
- `GET /api/users` - Get all users
- `PUT /api/users/:userId/roles` - Update user roles

### Patient Management
- `POST /api/patients` - Create patient
- `GET /api/patients` - Get patients (filtered by location)
- `GET /api/patients/:patientId` - Get patient details
- `PUT /api/patients/:patientId` - Update patient

### Supply Management
- `POST /api/supplies` - Create supply item
- `GET /api/supplies` - Get supplies
- `PUT /api/supplies/:supplyId/stock` - Update stock levels
- `GET /api/supplies/:supplyId/transactions` - Get transaction history

### Phase Management
- `GET /api/phases` - Get all phases
- `GET /api/phases/patient/:patientId` - Get patient phases

## Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Tokens**: Secure authentication tokens
- **Response Encryption**: All sensitive data encrypted in responses
- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Joi schema validation
- **SQL Injection Protection**: Parameterized queries
- **Audit Logging**: Complete change tracking

## Role Permissions

### Admin
- Full system access
- User management
- All patient data
- All supply data

### City Coordinator
- Patient data for assigned cities
- Phase management for assigned patients

### Country Coordinator
- Patient data for assigned countries
- Phase management for assigned patients

### Supply Manager
- Supply inventory management
- Stock level updates
- Transaction tracking

## Response Format

All API responses follow this encrypted format:
\`\`\`json
{
  "success": true,
  "message": "Success message",
  "encrypted_data": "encrypted_response_data",
  "data_hash": "sha256_hash_of_data",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`

## Error Handling

Standardized error responses with appropriate HTTP status codes:
- 400: Bad Request / Validation Error
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error
