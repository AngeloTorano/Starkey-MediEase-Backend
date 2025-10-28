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

-- Ear Screening (Phases 3)
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