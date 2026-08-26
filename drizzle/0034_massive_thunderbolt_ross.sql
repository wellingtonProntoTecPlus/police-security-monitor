CREATE TABLE `registration_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document` varchar(18) NOT NULL,
	`ownerType` varchar(20) NOT NULL,
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `registration_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `registration_documents_document_unique` UNIQUE(`document`)
);
--> statement-breakpoint
ALTER TABLE `clients` MODIFY COLUMN `document` varchar(18);--> statement-breakpoint
ALTER TABLE `partner_companies` MODIFY COLUMN `cnpj` varchar(18);