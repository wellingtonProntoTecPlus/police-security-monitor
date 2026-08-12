ALTER TABLE `alarm_systems` ADD `maintenanceStartAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `maintenanceStartAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `maintenanceEndAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `maintenanceNotes` text;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `maintenanceOperatorId` int;--> statement-breakpoint
ALTER TABLE `incidents` ADD `observationUntil` timestamp;
