ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','supervisor','operator','partner') NOT NULL DEFAULT 'operator';--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `imeiGprs` varchar(6);--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `isepId` varchar(4);