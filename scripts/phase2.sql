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

-- Ear Screening (Phases 2)
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

-- Hearing Screening (Phases 2)
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