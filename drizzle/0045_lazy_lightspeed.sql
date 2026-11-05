ALTER TABLE `clients` ADD `isPartnerHeadquarters` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `operator_attendance_records` ADD `scheduleStatus` enum('scheduled','outside_window');--> statement-breakpoint
ALTER TABLE `operator_attendance_records` ADD `outOfScheduleReason` enum('scale_swap','double_shift','vacation_coverage');--> statement-breakpoint
ALTER TABLE `operator_attendance_records` ADD `outOfScheduleDecisionAt` timestamp;--> statement-breakpoint
ALTER TABLE `registration_documents` ADD CONSTRAINT `registration_documents_document_ownerType_unique` UNIQUE(`document`,`ownerType`);--> statement-breakpoint
ALTER TABLE `registration_documents` DROP INDEX `registration_documents_document_unique`;
