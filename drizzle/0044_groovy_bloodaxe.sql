ALTER TABLE `operator_attendance_records` MODIFY COLUMN `shiftCode` enum('first','second','third','commercial');--> statement-breakpoint
ALTER TABLE `operator_shift_assignments` MODIFY COLUMN `shiftCode` enum('first','second','third','commercial') NOT NULL;--> statement-breakpoint
ALTER TABLE `operator_shift_exceptions` MODIFY COLUMN `shiftCode` enum('first','second','third','commercial');--> statement-breakpoint
ALTER TABLE `operator_shift_reminders` MODIFY COLUMN `shiftCode` enum('first','second','third','commercial') NOT NULL;