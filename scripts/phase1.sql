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

-- Hearing Screening (Phases 1)
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