ALTER TABLE `photo` ADD `room_id` text REFERENCES room(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `photo_room_idx` ON `photo` (`room_id`);
