CREATE TABLE `incident_panel_leases` (
	`incidentId` int NOT NULL,
	`operatorId` int NOT NULL,
	`authSessionId` bigint NOT NULL,
	`leaseToken` varchar(36) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incident_panel_leases_incidentId` PRIMARY KEY(`incidentId`),
	CONSTRAINT `incident_panel_leases_session_incident_unique` UNIQUE(`authSessionId`,`incidentId`)
);
--> statement-breakpoint
CREATE INDEX `incident_panel_leases_operator_expiry_idx` ON `incident_panel_leases` (`operatorId`,`expiresAt`);
