ALTER TABLE `partner_holidays` ADD `type` enum('nacional','municipal') DEFAULT 'municipal' NOT NULL;--> statement-breakpoint
ALTER TABLE `partner_holidays` DROP COLUMN `recurring`;