CREATE TABLE `compatec_zone_arm_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`zoneNumber` int NOT NULL,
	`operatorId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`armCommandId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compatec_zone_arm_selections_id` PRIMARY KEY(`id`),
	CONSTRAINT `compatec_zone_arm_selection_system_zone_unique` UNIQUE(`alarmSystemId`,`zoneNumber`)
);
--> statement-breakpoint
CREATE INDEX `compatec_zone_arm_selection_expiry_idx` ON `compatec_zone_arm_selections` (`alarmSystemId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `compatec_zone_arm_selection_command_idx` ON `compatec_zone_arm_selections` (`armCommandId`);