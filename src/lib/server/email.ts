import { APP_URL, MAIL_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER } from '$app/env/private';

export interface Email {
	to: string;
	subject: string;
	text: string;
}

type Mailer = (email: Email) => Promise<void>;

let override: Mailer | undefined;
/** Tests replace the real SMTP connection with their own function (pass undefined to restore). */
export function setMailerForTests(mailer: Mailer | undefined) {
	override = mailer;
}

/** Email works when SMTP is configured, and there is a public address for the links. */
export function emailConfigured(): boolean {
	return override !== undefined || Boolean(SMTP_HOST && APP_URL);
}

/** The public address of the app without a trailing slash, or '' when not configured. */
export const appUrl = () => APP_URL.replace(/\/+$/, '');

/** Sends one plain-text email. Returns false (and logs, without any link or token) if it could not be sent. */
export async function sendEmail(email: Email): Promise<boolean> {
	if (!emailConfigured()) return false;
	try {
		if (override) await override(email);
		else {
			const { createTransport } = await import('nodemailer');
			const port = Number(SMTP_PORT) || 587;
			await createTransport({
				host: SMTP_HOST,
				port,
				secure: port === 465,
				// Never send credentials or links in clear text to a remote server.
				requireTLS: port !== 465 && !['localhost', '127.0.0.1', '::1'].includes(SMTP_HOST),
				auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
			}).sendMail({ from: MAIL_FROM, to: email.to, subject: email.subject, text: email.text });
		}
		return true;
	} catch (error) {
		console.error(JSON.stringify({ message: 'Email could not be sent', subject: email.subject, error: (error as Error)?.message }));
		return false;
	}
}

export function inviteEmail(to: string, link: string, invitedBy: string): Email {
	return {
		to,
		subject: 'You are invited to Mehzur',
		text: `${invitedBy} has invited you to Mehzur, an app for photographing a house and measuring its rooms.\n\nOpen this link to create your account (it works once and expires in 7 days):\n\n${link}\n\nIf you were not expecting this, you can ignore this email.\n`
	};
}

export function resetEmail(to: string, link: string): Email {
	return {
		to,
		subject: 'Reset your Mehzur password',
		text: `Someone asked to reset the password for your Mehzur account.\n\nOpen this link to choose a new password (it works once and expires in 1 hour):\n\n${link}\n\nIf this was not you, ignore this email: your password has not changed.\n`
	};
}
