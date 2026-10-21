-- ============================================================
-- Database schema untuk Excel Comparison App
-- Jalankan di phpMyAdmin / MySQL CLI Laragon
-- ============================================================

CREATE DATABASE IF NOT EXISTS excel_compare
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE excel_compare;

-- Tabel metadata job komparasi
CREATE TABLE IF NOT EXISTS comparison_jobs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    bulan            VARCHAR(2)   NOT NULL COMMENT 'Bulan periode 01-12',
    tahun            VARCHAR(4)   NOT NULL COMMENT 'Tahun periode',
    tipe_data        ENUM('OS Cedant','Infopack') NOT NULL,
    primary_key_col  VARCHAR(255) NOT NULL COMMENT 'Nama kolom primary key',
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
    INDEX idx_status  (status),
    INDEX idx_periode (bulan, tahun)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel detail hasil komparasi per baris
CREATE TABLE IF NOT EXISTS comparison_results (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    job_id              INT          NOT NULL,
    primary_key_value   VARCHAR(500) NOT NULL,
    diff_type           ENUM('matched','only_in_a','only_in_b','changed') NOT NULL,
    row_data_a          LONGTEXT NULL  COMMENT 'JSON data baris dari File A',
    row_data_b          LONGTEXT NULL  COMMENT 'JSON data baris dari File B',
    changed_columns     TEXT NULL      COMMENT 'JSON array nama kolom yang berubah',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job_id    (job_id),
    INDEX idx_diff_type (diff_type),
    INDEX idx_pk_value  (primary_key_value(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
