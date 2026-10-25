CREATE TABLE `annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`room_id` text,
	`name` text,
	`x1` real NOT NULL,
	`y1` real NOT NULL,
	`x2` real NOT NULL,
	`y2` real NOT NULL,
	`value_mm` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photo`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `annotation_photo_idx` ON `annotation` (`photo_id`);--> statement-breakpoint
CREATE INDEX `annotation_room_idx` ON `annotation` (`room_id`);--> statement-breakpoint
CREATE TABLE `photo` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`blob_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`caption` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_blob_key_unique` ON `photo` (`blob_key`);--> statement-breakpoint
CREATE INDEX `photo_project_idx` ON `photo` (`project_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit_system` text DEFAULT 'imperial' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`area_a_annotation_id` text,
	`area_b_annotation_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_a_annotation_id`) REFERENCES `annotation`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`area_b_annotation_id`) REFERENCES `annotation`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `room_project_idx` ON `room` (`project_id`);