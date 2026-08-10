ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','supervisor','operator') NOT NULL DEFAULT 'operator';--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `qualifier` enum('E','R','both') DEFAULT 'E' NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `isUniversal` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(255);