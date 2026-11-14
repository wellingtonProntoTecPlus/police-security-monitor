ALTER TABLE `incident_history` ADD `requestId` varchar(64);--> statement-breakpoint
ALTER TABLE `incident_history` ADD CONSTRAINT `incident_history_request_unique` UNIQUE(`requestId`);