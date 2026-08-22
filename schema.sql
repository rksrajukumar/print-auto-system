CREATE DATABASE IF NOT EXISTS auto_print;
USE auto_print;

CREATE TABLE IF NOT EXISTS clients (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 client_id VARCHAR(80) NOT NULL UNIQUE,
 client_token VARCHAR(160) NOT NULL UNIQUE,
 client_name VARCHAR(160) DEFAULT '',
 pc_name VARCHAR(160) DEFAULT '',
 hostname VARCHAR(160) DEFAULT '',
 printer_name VARCHAR(255) DEFAULT '',
 status ENUM('online','offline') DEFAULT 'offline',
 last_seen DATETIME NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 job_id VARCHAR(100) NOT NULL UNIQUE,
 client_id VARCHAR(80) NOT NULL,
 file_name VARCHAR(255) NOT NULL,
 file_path VARCHAR(500) NOT NULL,
 print_type VARCHAR(20) DEFAULT 'BW',
 paper_size VARCHAR(30) DEFAULT 'A4',
 copies INT DEFAULT 1,
 amount DECIMAL(10,2) DEFAULT 0,
 payment_status ENUM('pending','paid') DEFAULT 'pending',
 job_status ENUM('queued','sent','printing','printed','cancelled','failed') DEFAULT 'queued',
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 printed_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS payment_settings (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 client_id VARCHAR(80) NULL UNIQUE,
 upi_id VARCHAR(255) DEFAULT '',
 upi_number VARCHAR(80) DEFAULT '',
 qr_data TEXT,
 base_amount DECIMAL(10,2) DEFAULT 10.00,
 bw_per_page DECIMAL(10,2) DEFAULT 1.00,
 colour_per_page DECIMAL(10,2) DEFAULT 5.00,
 minimum_amount DECIMAL(10,2) DEFAULT 10.00
);

CREATE TABLE IF NOT EXISTS logs (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 level VARCHAR(20) DEFAULT 'INFO',
 message TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
