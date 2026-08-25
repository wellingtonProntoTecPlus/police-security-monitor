ALTER TABLE `alarm_remote_credentials` DROP INDEX `alarm_remote_credentials_alarmSystemId_unique`;--> statement-breakpoint
ALTER TABLE `alarm_remote_credentials` ADD `technicalUserCode` varchar(20);--> statement-breakpoint
ALTER TABLE `alarm_remote_credentials` ADD CONSTRAINT `alarm_remote_credentials_system_kind_unique` UNIQUE(`alarmSystemId`,`credentialKind`);