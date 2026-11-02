CREATE INDEX `alarm_events_received_idx` ON `alarm_events` (`receivedAt`,`id`);--> statement-breakpoint
CREATE INDEX `alarm_events_system_code_received_idx` ON `alarm_events` (`alarmSystemId`,`eventCode`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `alarm_events_account_received_idx` ON `alarm_events` (`account`,`receivedAt`,`id`);--> statement-breakpoint
CREATE INDEX `occurrences_finalized_idx` ON `occurrences` (`finalizedAt`,`id`);--> statement-breakpoint
CREATE INDEX `occurrences_account_finalized_idx` ON `occurrences` (`account`,`finalizedAt`,`id`);--> statement-breakpoint
CREATE INDEX `occurrences_client_finalized_idx` ON `occurrences` (`clientId`,`finalizedAt`,`id`);--> statement-breakpoint
CREATE INDEX `occurrences_partner_finalized_idx` ON `occurrences` (`partnerCompanyId`,`finalizedAt`,`id`);
