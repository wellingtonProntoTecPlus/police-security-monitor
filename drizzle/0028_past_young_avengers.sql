ALTER TABLE `alarm_systems` ADD `simCardNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `simPhoneNumber` varchar(30);--> statement-breakpoint
ALTER TABLE `alarm_users` ADD `apartmentNumber` varchar(30);--> statement-breakpoint
ALTER TABLE `clients` ADD `propertyType` enum('residence','company','condominium') DEFAULT 'residence' NOT NULL;