-- ============================================================
-- Database schema untuk Excel Comparison App
-- Jalankan di phpMyAdmin / MySQL CLI Laragon
-- ============================================================

CREATE DATABASE IF NOT EXISTS excel_compare
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE excel_compare;

-- ─────────────────────────────────────────────
-- comparison_jobs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparison_jobs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_id       VARCHAR(36)  NULL     COMMENT 'Browser session UUID (X-Session-ID)',
    bulan            VARCHAR(2)   NOT NULL COMMENT 'Bulan periode 01-12',
    tahun            VARCHAR(4)   NOT NULL COMMENT 'Tahun periode',
    tipe_data        ENUM('OS Cedant','Infopack') NOT NULL,
    primary_key_col  VARCHAR(255) NOT NULL,
    file_a_name      VARCHAR(255) NOT NULL,
    file_b_name      VARCHAR(255) NOT NULL,
    sheet_a          VARCHAR(255) NULL,
    sheet_b          VARCHAR(255) NULL,
    status           ENUM('pending','processing','done','error') NOT NULL DEFAULT 'pending',
    total_rows_a     INT NULL,
    total_rows_b     INT NULL,
    total_matched    INT NULL,
    total_only_in_a  INT NULL,
    total_only_in_b  INT NULL,
    total_changed    INT NULL,
    error_message    TEXT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session  (session_id),
    INDEX idx_status   (status),
    INDEX idx_periode  (bulan, tahun)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- comparison_results
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparison_results (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    job_id              INT          NOT NULL,
    primary_key_value   VARCHAR(500) NOT NULL,
    diff_type           ENUM('matched','only_in_a','only_in_b','changed') NOT NULL,
    row_data_a          LONGTEXT NULL  COMMENT 'JSON data baris dari File A',
    row_data_b          LONGTEXT NULL  COMMENT 'JSON data baris dari File B',
    changed_columns     TEXT     NULL  COMMENT 'JSON array nama kolom yang berubah',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job_id    (job_id),
    INDEX idx_diff_type (diff_type),
    INDEX idx_pk_value  (primary_key_value(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- upload_jobs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upload_jobs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_id       VARCHAR(36)  NULL     COMMENT 'Browser session UUID',
    bulan            VARCHAR(2)   NOT NULL,
    tahun            VARCHAR(4)   NOT NULL,
    tipe_data        VARCHAR(50)  NOT NULL,
    primary_key_col  VARCHAR(255) NOT NULL,
    file_name        VARCHAR(255) NOT NULL,
    sheet_name       VARCHAR(255) NULL,
    cedant           VARCHAR(255) NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
    total_rows       INT NULL,
    rows_appended    INT NULL,
    rows_skipped     INT NULL,
    error_message    TEXT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session  (session_id),
    INDEX idx_tipe     (tipe_data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- master_data
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_data (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    session_id          VARCHAR(36)  NULL     COMMENT 'Browser session UUID',
    tipe_data           VARCHAR(50)  NOT NULL,
    bulan               VARCHAR(2)   NOT NULL,
    tahun               VARCHAR(4)   NOT NULL,
    cedant              VARCHAR(255) NULL,
    primary_key_value   VARCHAR(500) NOT NULL,
    source_job_id       INT          NOT NULL,
    row_data            LONGTEXT     NOT NULL COMMENT 'Full row as JSON',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session   (session_id),
    INDEX idx_tipe      (tipe_data),
    INDEX idx_cedant    (cedant),
    INDEX idx_pk        (primary_key_value(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- oscln_snapshots
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oscln_snapshots (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_id       VARCHAR(36)  NULL     COMMENT 'Browser session UUID',
    bulan            VARCHAR(2)   NOT NULL,
    tahun            VARCHAR(4)   NOT NULL,
    file_name        VARCHAR(255) NOT NULL,
    primary_key_col  VARCHAR(255) NOT NULL,
    total_rows       INT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- oscln_rows
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oscln_rows (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_id         INT          NOT NULL,
    primary_key_value   VARCHAR(500) NOT NULL,
    row_data            LONGTEXT     NOT NULL COMMENT 'Full row as JSON',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_snapshot  (snapshot_id),
    INDEX idx_pk        (primary_key_value(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- MIGRATION — jalankan ini jika database sudah ada sebelumnya
-- (skip jika fresh install di atas sudah dijalankan)
-- ============================================================

-- ALTER TABLE comparison_jobs
--     ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL COMMENT 'Browser session UUID' AFTER id,
--     ADD INDEX IF NOT EXISTS idx_session (session_id);

-- ALTER TABLE upload_jobs
--     ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL COMMENT 'Browser session UUID' AFTER id,
--     ADD INDEX IF NOT EXISTS idx_session (session_id);

-- ALTER TABLE master_data
--     ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL COMMENT 'Browser session UUID' AFTER id,
--     ADD INDEX IF NOT EXISTS idx_session (session_id);

-- ALTER TABLE oscln_snapshots
--     ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL COMMENT 'Browser session UUID' AFTER id,
--     ADD INDEX IF NOT EXISTS idx_session (session_id);
