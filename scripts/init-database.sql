-- =============================================================================
-- 1. User and Role Management Tables
-- =============================================================================

CREATE TABLE phases (
    phase_id INT PRIMARY KEY,
    phase_name VARCHAR(255) NOT NULL,
    phase_description TEXT
);

-- Insert the standard phases
INSERT INTO phases (phase_id, phase_name, phase_description) VALUES
(1, 'Phase 1 - Initial Screening', 'Initial patient registration, hearing assessment, and ear impressions'),
(2, 'Phase 2 - Hearing Aid Fitting', 'Hearing aid fitting, counseling, and quality control'),
(3, 'Phase 3 - Aftercare', 'Follow-up assessments and maintenance');

-- roles Table: Defines the different roles within the system
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE
);

-- Insert default roles
INSERT INTO roles (role_name) VALUES 
('admin'),
('city_coordinator'),
('country_coordinator'),
('supply_manager');

-- users Table: Stores user authentication and basic information
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, password_hash, first_name, last_name, email)
VALUES ('admin', '$2a$12$Gsxa7pi10GnZPC9Q/qWK0u8gPIBvcTajGRbptjENNDtayMIHuoSEq', 'admin', 'admin', 'admin@example.com');

-- user_roles Table: Links users to their assigned roles
CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    PRIMARY KEY (user_id, role_id)
);
INSERT INTO user_roles (user_id, role_id)
VALUES (1, 1);

-- countries Table: Lookup table for countries
CREATE TABLE countries (
    country_id SERIAL PRIMARY KEY,
    iso_code VARCHAR(3) UNIQUE,
    country_name VARCHAR(100) NOT NULL UNIQUE
);

-- Insert sample countries
INSERT INTO countries (iso_code, country_name) VALUES 
('US', 'United States'),
('CA', 'Canada'),
('MX', 'Mexico'),
('PH', 'Philippines'),
('IN', 'India');

-- cities Table: Lookup table for cities, linked to countries
CREATE TABLE cities (
    city_id SERIAL PRIMARY KEY,
    city_name VARCHAR(100) NOT NULL,
    country_id INTEGER NOT NULL REFERENCES countries(country_id),
    UNIQUE (city_name, country_id)
);

-- Insert sample cities
INSERT INTO cities (city_name, country_id) VALUES 
('New York', 1),
('Los Angeles', 1),
('Toronto', 2),

-- user_locations Table: Assigns users to specific countries or cities
CREATE TABLE user_locations (
    user_location_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    country_id INTEGER REFERENCES countries(country_id),
    city_id INTEGER REFERENCES cities(city_id),
    CONSTRAINT chk_country_or_city CHECK (country_id IS NOT NULL OR city_id IS NOT NULL)
);

-- =============================================================================
-- 2. Patient Core Information Table
-- =============================================================================

CREATE TABLE patients (
    patient_id SERIAL PRIMARY KEY,
    shf_id VARCHAR(50) UNIQUE,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    gender VARCHAR(50),
    date_of_birth DATE,
    age INTEGER,
    mobile_number VARCHAR(50),
    mobile_sms BOOLEAN,
    alternative_number VARCHAR(50),
    alternative_sms BOOLEAN,
    region_district VARCHAR(100),
    city_village VARCHAR(100),
    highest_education_level VARCHAR(100),
    employment_status VARCHAR(100),
    school_name VARCHAR(255),
    school_phone_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. Phase-Specific Data Tables
-- =============================================================================

-- Patient Phase Tracking
CREATE TABLE patient_phases (
    patient_phase_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER NOT NULL REFERENCES phases(phase_id),
    phase_start_date DATE NOT NULL,
    phase_end_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'In Progress',
    completed_by_user_id INTEGER REFERENCES users(user_id),
    UNIQUE (patient_id, phase_id)
);

-- Phase 1 - Registration Section
CREATE TABLE phase1_registration_section (
    phase1_reg_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 1 REFERENCES phases(phase_id),
    registration_date DATE NOT NULL,
    city VARCHAR(100),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    has_hearing_loss VARCHAR(50),
    uses_sign_language VARCHAR(50),
    uses_speech VARCHAR(50),
    hearing_loss_causes TEXT[],
    ringing_sensation VARCHAR(50),
    ear_pain VARCHAR(50),
    hearing_satisfaction_18_plus VARCHAR(50),
    conversation_difficulty VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ear Screening (Phases 1, 2, and 3)
CREATE TABLE ear_screening (
    ear_screening_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER NOT NULL REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    screening_name VARCHAR(50),
    ears_clear VARCHAR(50),
    otc_wax INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_infection INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_perforation INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_tinnitus INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_atresia INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_implant INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    otc_other INTEGER, -- 0 = No, 1 = Yes (Left), 2 = Yes (Right), 3 = Yes (Both)
    medical_recommendation VARCHAR(50),
    medication_given TEXT[],
    left_ears_clear_for_fitting VARCHAR(50),
    right_ears_clear_for_fitting VARCHAR(50),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hearing Screening (Phases 1 and 2)
CREATE TABLE hearing_screening (
    hearing_screen_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER NOT NULL REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    screening_method VARCHAR(100),
    left_ear_result VARCHAR(50),
    right_ear_result VARCHAR(50),
    hearing_satisfaction_18_plus_pass VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 1 - Ear Impressions
CREATE TABLE ear_impressions (
    impression_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 1 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    ear_impression VARCHAR(10),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 1 - Final Quality Control
CREATE TABLE final_qc_p1 (
    final_qc_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 1 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    ear_impressions_inspected_collected BOOLEAN,
    shf_id_number_id_card_given BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 - Registration Section
CREATE TABLE phase2_registration_section (
    phase2_reg_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 2 REFERENCES phases(phase_id),
    registration_date DATE NOT NULL,
    city VARCHAR(100),
    patient_type VARCHAR(100),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 - Fitting Table
CREATE TABLE fitting_table (
    fitting_table_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER NOT NULL REFERENCES phases(phase_id),
    fitter_id INTEGER REFERENCES users(user_id),
    fitting_left_power_level VARCHAR(100),
    fitting_left_volume VARCHAR(100),
    fitting_left_model VARCHAR(100),
    fitting_left_battery VARCHAR(50),
    fitting_left_earmold VARCHAR(100),
    fitting_right_power_level VARCHAR(100),
    fitting_right_volume VARCHAR(100),
    fitting_right_model VARCHAR(100),
    fitting_right_battery VARCHAR(50),
    fitting_right_earmold VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 - Fitting
CREATE TABLE fitting (
    fitting_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER NOT NULL REFERENCES phases(phase_id),
    fitter_id INTEGER REFERENCES users(user_id),
    number_of_hearing_aid INTEGER,
    special_device VARCHAR(100),
    normal_hearing INTEGER,
    distortion INTEGER,
    implant INTEGER,
    recruitment INTEGER,
    no_response INTEGER,
    other INTEGER,
    comment TEXT,
    clear_for_counseling BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 - Counseling
CREATE TABLE counseling (
    counseling_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 2 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    received_aftercare_information BOOLEAN,
    trained_as_student_ambassador BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2 - Final Quality Control
CREATE TABLE final_qc_p2 (
    final_qc_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 2 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    batteries_provided_13 INTEGER,
    batteries_provided_675 INTEGER,
    hearing_aid_satisfaction_18_plus VARCHAR(50),
    confirmation BOOLEAN,
    qc_comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 3 - Registration Section
CREATE TABLE phase3_registration_section (
    phase3_reg_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 3 REFERENCES phases(phase_id),
    registration_date DATE NOT NULL,
    country VARCHAR(100),
    city VARCHAR(100),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    type_of_aftercare VARCHAR(100),
    service_center_school_name VARCHAR(255),
    return_visit_custom_earmold_repair BOOLEAN,
    problem_with_hearing_aid_earmold VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 3 - Aftercare Assessment
CREATE TABLE aftercare_assessment (
    assessment_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 3 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    eval_hearing_aid_dead_broken INTEGER,
    eval_hearing_aid_internal_feedback INTEGER,
    eval_hearing_aid_power_change_needed INTEGER,
    eval_hearing_aid_power_change_too_low INTEGER,
    eval_hearing_aid_power_change_too_loud INTEGER,
    eval_hearing_aid_lost_stolen INTEGER,
    eval_hearing_aid_no_problem INTEGER,
    eval_earmold_discomfort_too_tight INTEGER,
    eval_earmold_feedback_too_loose INTEGER,
    eval_earmold_damaged_tubing_cracked INTEGER,
    eval_earmold_lost_stolen INTEGER,
    eval_earmold_no_problem INTEGER,
    service_tested_wfa_demo_hearing_aids INTEGER,
    service_hearing_aid_sent_for_repair_replacement INTEGER,
    service_not_benefiting_from_hearing_aid INTEGER,
    service_refit_new_hearing_aid INTEGER,
    service_retubed_unplugged_earmold INTEGER,
    service_modified_earmold INTEGER,
    service_fit_stock_earmold INTEGER,
    service_took_new_ear_impression INTEGER,
    service_refit_custom_earmold INTEGER,
    gs_counseling BOOLEAN,
    gs_batteries_provided BOOLEAN,
    gs_batteries_13_qty INTEGER,
    gs_batteries_675_qty INTEGER,
    gs_refer_aftercare_service_center BOOLEAN,
    gs_refer_next_phase2_mission BOOLEAN,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 3 - Final Quality Control
CREATE TABLE final_qc_p3 (
    final_qc_id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(patient_id),
    phase_id INTEGER DEFAULT 3 REFERENCES phases(phase_id),
    completed_by_user_id INTEGER REFERENCES users(user_id),
    hearing_aid_satisfaction_18_plus VARCHAR(50),
    ask_people_to_repeat_themselves VARCHAR(50),
    notes_from_shf TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- schedules Table: Stores mission or schedule information
CREATE TABLE schedules (
    schedule_id SERIAL PRIMARY KEY,
    mission_name VARCHAR(50),
    description TEXT,
    AfterCareCity VARCHAR(100),
    date DATE NOT NULL,
    time TIME,
    status VARCHAR(50),
    created_by_user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- =============================================================================
-- 4. Supply Management Tables
-- =============================================================================

CREATE TABLE supply_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE
);

-- Insert sample supply categories
INSERT INTO supply_categories (category_name) VALUES 
('Hearing Aids'),
('Batteries'),
('Earmolds'),
('Medical Supplies'),
('Testing Equipment'),
('Cleaning Supplies');

CREATE TABLE supplies (
    supply_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES supply_categories(category_id),
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    current_stock_level INTEGER NOT NULL DEFAULT 0,
    unit_of_measure VARCHAR(50),
    reorder_level INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE supply_transaction_types (
    transaction_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL UNIQUE
);

-- Insert transaction types
INSERT INTO supply_transaction_types (type_name) VALUES 
('Received'),
('Used'),
('Damaged'),
('Lost'),
('Returned'),
('Transferred');

CREATE TABLE supply_transactions (
    transaction_id SERIAL PRIMARY KEY,
    supply_id INTEGER NOT NULL REFERENCES supplies(supply_id),
    transaction_type_id INTEGER NOT NULL REFERENCES supply_transaction_types(transaction_type_id),
    quantity INTEGER NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    recorded_by_user_id INTEGER REFERENCES users(user_id),
    notes TEXT
);


-- sms_messages Table: Stores all sent SMS (notifications or OTP)
CREATE TABLE sms_messages (
    sms_id SERIAL PRIMARY KEY,
    message_type VARCHAR(50),
    message_content TEXT NOT NULL,
    recipient_count INT DEFAULT 0,
    recipients TEXT, -- Optional: store list of phone numbers sent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- otp_codes Table: Stores OTP codes for 2FA login verification
CREATE TABLE otp_codes (
    otp_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- =============================================================================
-- 5. Audit Logging Table
-- =============================================================================

CREATE TABLE audit_logs (
    log_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by_user_id INTEGER REFERENCES users(user_id),
    change_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- Indexes for patient lookups
CREATE INDEX idx_patients_shf_id ON patients(shf_id);
CREATE INDEX idx_patients_last_name ON patients(last_name);
CREATE INDEX idx_patients_first_name ON patients(first_name);

-- Indexes for phase tracking
CREATE INDEX idx_patient_phases_patient_id ON patient_phases(patient_id);
CREATE INDEX idx_patient_phases_phase_id ON patient_phases(phase_id);

-- Indexes for user management
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_locations_user_id ON user_locations(user_id);

-- Indexes for supply management
CREATE INDEX idx_supplies_category ON supplies(category_id);
CREATE INDEX idx_supply_transactions_supply ON supply_transactions(supply_id);
CREATE INDEX idx_supply_transactions_type ON supply_transactions(transaction_type_id);

-- Indexes for audit logs
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(change_timestamp);

-- Indexes for phase-specific tables
CREATE INDEX idx_phase1_reg_patient_id ON phase1_registration_section(patient_id);
CREATE INDEX idx_ear_screening_patient_id ON ear_screening(patient_id);
CREATE INDEX idx_hearing_screening_patient_id ON hearing_screening(patient_id);
CREATE INDEX idx_ear_impressions_patient_id ON ear_impressions(patient_id);
CREATE INDEX idx_final_qc_p1_patient_id ON final_qc_p1(patient_id);
CREATE INDEX idx_phase2_reg_patient_id ON phase2_registration_section(patient_id);
CREATE INDEX idx_fitting_table_patient_id ON fitting_table(patient_id);
CREATE INDEX idx_fitting_patient_id ON fitting(patient_id);
CREATE INDEX idx_counseling_patient_id ON counseling(patient_id);
CREATE INDEX idx_final_qc_p2_patient_id ON final_qc_p2(patient_id);
CREATE INDEX idx_phase3_reg_patient_id ON phase3_registration_section(patient_id);
CREATE INDEX idx_aftercare_assessment_patient_id ON aftercare_assessment(patient_id);
CREATE INDEX idx_final_qc_p3_patient_id ON final_qc_p3(patient_id);








