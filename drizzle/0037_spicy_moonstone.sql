ALTER TABLE `clients` ADD `monitoringStatus` enum('active','blocked','suspended') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `monitoringStatusReason` varchar(255);--> statement-breakpoint
ALTER TABLE `clients` ADD `monitoringStatusUntil` timestamp;