CREATE TABLE `alarm_pgms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`pgmNumber` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_pgms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alarm_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`partition` int NOT NULL DEFAULT 1,
	`name` varchar(255),
	`mondayArm` varchar(5),
	`mondayDisarm` varchar(5),
	`tuesdayArm` varchar(5),
	`tuesdayDisarm` varchar(5),
	`wednesdayArm` varchar(5),
	`wednesdayDisarm` varchar(5),
	`thursdayArm` varchar(5),
	`thursdayDisarm` varchar(5),
	`fridayArm` varchar(5),
	`fridayDisarm` varchar(5),
	`saturdayArm` varchar(5),
	`saturdayDisarm` varchar(5),
	`sundayArm` varchar(5),
	`sundayDisarm` varchar(5),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_procedures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`priority` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_procedures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partner_holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerCompanyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`date` varchar(10) NOT NULL,
	`recurring` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partner_holidays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `communicationType` enum('ethernet','gprs','both') DEFAULT 'ethernet' NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `macAddress` varchar(6);--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `viawebCode` varchar(4);--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `installDate` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `batteryDate` timestamp;--> statement-breakpoint
ALTER TABLE `client_contacts` ADD `password` varchar(50);--> statement-breakpoint
ALTER TABLE `client_contacts` ADD `counterPassword` varchar(50);--> statement-breakpoint
ALTER TABLE `client_contacts` ADD `coercionPassword` varchar(50);