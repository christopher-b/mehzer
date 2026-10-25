-- A measurement's room now always comes from its photo. Keep existing data meaningful:
-- an unassigned photo adopts the room of one of its measurements (if any).
UPDATE `photo` SET `room_id` = (
	SELECT `room_id` FROM `annotation`
	WHERE `annotation`.`photo_id` = `photo`.`id` AND `annotation`.`room_id` IS NOT NULL
	ORDER BY `annotation`.`created_at` LIMIT 1
) WHERE `room_id` IS NULL;--> statement-breakpoint
-- Dropping the old annotation table would fire ON DELETE SET NULL on rooms' saved area
-- selections, so back them up and restore them after the rebuild.
CREATE TABLE `__room_area_backup` AS
	SELECT `id`, `area_a_annotation_id` AS `a`, `area_b_annotation_id` AS `b` FROM `room`
	WHERE `area_a_annotation_id` IS NOT NULL OR `area_b_annotation_id` IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`name` text,
	`x1` real NOT NULL,
	`y1` real NOT NULL,
	`x2` real NOT NULL,
	`y2` real NOT NULL,
	`value_mm` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photo`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_annotation`("id", "photo_id", "name", "x1", "y1", "x2", "y2", "value_mm", "created_at") SELECT "id", "photo_id", "name", "x1", "y1", "x2", "y2", "value_mm", "created_at" FROM `annotation`;--> statement-breakpoint
DROP TABLE `annotation`;--> statement-breakpoint
ALTER TABLE `__new_annotation` RENAME TO `annotation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `annotation_photo_idx` ON `annotation` (`photo_id`);
--> statement-breakpoint
UPDATE `room` SET
	`area_a_annotation_id` = (SELECT `a` FROM `__room_area_backup` WHERE `__room_area_backup`.`id` = `room`.`id`),
	`area_b_annotation_id` = (SELECT `b` FROM `__room_area_backup` WHERE `__room_area_backup`.`id` = `room`.`id`)
WHERE `id` IN (SELECT `id` FROM `__room_area_backup`);--> statement-breakpoint
DROP TABLE `__room_area_backup`;
