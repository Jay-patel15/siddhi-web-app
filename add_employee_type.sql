-- Migration: Add employee_type field for Fixed Salary Supervisors
-- Run this in Supabase SQL Editor
-- Date: 2026-05-07

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employee_type TEXT DEFAULT 'daily_wage';

-- Update existing employees to daily_wage (already the default, but explicit)
UPDATE employees SET employee_type = 'daily_wage' WHERE employee_type IS NULL;

-- To manually set Ajay Tiwari as fixed_salary, run:
-- UPDATE employees SET employee_type = 'fixed_salary' WHERE name = 'AJAY TIWARI';
