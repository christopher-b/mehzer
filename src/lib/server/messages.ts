import { NAME_MAX_LENGTH } from '#lib/constants.ts';

export const messages = {
	projectFields: `Enter a name (up to ${NAME_MAX_LENGTH} characters) and choose units`,
	roomName: `Enter a room name (up to ${NAME_MAX_LENGTH} characters)`,
	annotationName: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
	annotationNotFound: 'Measurement not found'
};
