ALTER TABLE `contact_id_codes` DROP INDEX `contact_id_codes_code_unique`;--> statement-breakpoint
ALTER TABLE `contact_id_codes` MODIFY COLUMN `code` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` MODIFY COLUMN `category` enum('alarm','restore','fault','arm_disarm','test','system','access') NOT NULL DEFAULT 'alarm';--> statement-breakpoint
ALTER TABLE `contact_id_codes` MODIFY COLUMN `priority` enum('critical','high','medium','low') DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `fabricante` varchar(20) DEFAULT 'COMPATEC' NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `tipo` varchar(20) DEFAULT 'alarme' NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `cor` varchar(10) DEFAULT '#EF4444' NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `abre_tela` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `fecha_automatico` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `fecha_com_restauracao` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `codigo_restauracao` varchar(10) DEFAULT '';--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `tempo_espera_segundos` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_id_codes` ADD `prioridade` int DEFAULT 1 NOT NULL;